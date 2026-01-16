using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text;
using TripMatch.Models;
using TripMatch.Models.Settings;
using TripMatch.Services;
using static TripMatch.Services.AuthServicesExtensions;
using System.Globalization;
using Microsoft.Extensions.Caching.Memory;
using System;
using System.Threading.Tasks;

namespace TripMatch.Controllers.Api
{
    [ApiController]
    [Route("api/auth")]
    public class AuthApiController : ControllerBase
    {
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly AuthService _authService;
        private readonly IEmailSender<ApplicationUser> _emailSender;
        private readonly TravelDbContext _dbContext;
        private readonly ITagUserId _tagUserId;

        private readonly ILogger<AuthApiController> _logger;

        // In-memory notification store
        private readonly InMemoryNotificationStore _store;



        private static readonly Dictionary<string, byte[][]> _imageSignatures = new(StringComparer.OrdinalIgnoreCase)
        {
            { ".jpg", new[] { new byte[] { 0xFF, 0xD8, 0xFF } } },
            { ".jpeg", new[] { new byte[] { 0xFF, 0xD8, 0xFF } } },
            { ".png", new[] { new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A } } },
            { ".gif", new[] { new byte[] { (byte)'G', (byte)'I', (byte)'F', (byte)'8' } } }
        };


        public AuthApiController(
     SignInManager<ApplicationUser> signInManager,
     UserManager<ApplicationUser> userManager,
     AuthService authService,
     IEmailSender<ApplicationUser> emailSender,
     TravelDbContext dbContext,
     ITagUserId tagUserId,
     InMemoryNotificationStore store,
     ILogger<AuthApiController> logger
     )
        {
            _signInManager = signInManager;
            _userManager = userManager;
            _authService = authService;
            _emailSender = emailSender;
            _dbContext = dbContext;
            _tagUserId = tagUserId;
            _logger = logger;
            _store = store;
        }

    
        [HttpGet("~/api/userstatus/emailconfirmed")]
        [Authorize]
        public async Task<IActionResult> EmailConfirmed()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var user = await _userManager.FindByIdAsync(userId);
            var confirmed = user != null && await _userManager.IsEmailConfirmedAsync(user);

            return Ok(new { emailConfirmed = confirmed });
        }

        [HttpGet("GetLockedRanges")]
        [Authorize]
        public async Task<IActionResult> GetLockedRanges(int? userId)
        {
            // 1. 取得使用者 ID (優先從 Token 拿)
            if (!userId.HasValue)
            {
                var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrEmpty(claim) || !int.TryParse(claim, out var parsed)) return Unauthorized();
                userId = parsed;
            }

            // 2. 撈取該使用者的行程區間
            // 使用 AsNoTracking 提高讀取效能
            var ranges = await _dbContext.TripMembers
                .AsNoTracking()
                .Where(tm => tm.UserId == userId.Value)
                .Select(tm => new { tm.Trip.StartDate, tm.Trip.EndDate })
                .Where(t => t.StartDate != default && t.EndDate != default)
                .Distinct()
                .ToListAsync();

            // 3. 格式化回傳
            var result = ranges.Select(r => new
            {
                start = r.StartDate.ToString("yyyy-MM-dd"),
                end = r.EndDate.ToString("yyyy-MM-dd")
            }).ToList();

            // 4. 自動加上「今天以前」的鎖定區間 (如果你希望後端統一處理)
            return Ok(new { ranges = result });
        }

        [HttpGet("GetLeaves")]
        [Authorize]
        public async Task<IActionResult> GetLeaves(int? userId)
        {
            if (!userId.HasValue)
            {
                var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (string.IsNullOrEmpty(claim) || !int.TryParse(claim, out var parsed)) return Unauthorized();
                userId = parsed;
            }

            // 資料表為 LeaveDate 且欄位為DateOnly
            var leaves = await _dbContext.Set<LeaveDate>()
                .Where(l => l.UserId == userId.Value && l.LeaveDate1.HasValue)
                .Select(l => l.LeaveDate1!.Value.ToString("yyyy-MM-dd"))
                .ToListAsync();
            //return Ok();
            return Ok(new { dates = leaves });
        }



        [HttpPost("Signin")]
        public async Task<IActionResult> Signin([FromBody] LoginModel data)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(new { success = false, message = "輸入資料格式錯誤" });
            }

            var result = await _signInManager.PasswordSignInAsync(data.Email!, data.Password!, isPersistent: false, lockoutOnFailure: true);

            ApplicationUser? user = null;

            if (result.Succeeded)
            {
                user = await _userManager.FindByEmailAsync(data.Email!);
                if (user != null)
                {
                    // 保險：清除舊 Cookie/Session，避免殘留資料在前端短暫顯示
                    try { HttpContext.Session?.Clear(); } catch { }
                    try { Response.Cookies.Delete("PendingEmail"); } catch { }
                    try { Response.Cookies.Delete("AuthToken"); } catch { }

                    var token = _authService.GenerateJwtToken(user);
                    _authService.SetAuthCookie(HttpContext, token);
                    _authService.SetPendingCookie(HttpContext, user.Email);
                }

                return Ok(new
                {
                    success = true,
                    message = "登入成功",
                    redirectUrl = Url.Action("Index", "Home")
                });
            }

            if (user == null)
            {
                user = await _userManager.FindByEmailAsync(data.Email!);
            }

            if (result.IsLockedOut)
            {
                return StatusCode(423, new { success = false, message = "帳號已被鎖定，請稍後再試。" });
            }

            var accessFailedCount = user != null ? await _userManager.GetAccessFailedCountAsync(user) : 0;
            var remainingAttempts = 5 - accessFailedCount;

            return BadRequest(new { success = false, message = $"帳號或密碼錯誤。剩餘嘗試次數：{remainingAttempts}" });
        }
        // 登出 API
        [HttpPost("Logout")]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            Response.Cookies.Delete("AuthToken");

            var redirectUrl = Url.Action("Index", "Home");
            return Ok(new { redirectUrl });
        }

        [HttpPost("ClearPendingSession")]
        public IActionResult ClearPendingSession()
        {
            Response.Cookies.Delete("PendingEmail");
            return Ok(new { message = "已清除狀態" });
        }


        // 寄送驗證信 API
        [HttpPost("SendConfirmation")]
        public async Task<IActionResult> SendConfirmation([FromBody] string email)
        {
            var user = await _userManager.FindByEmailAsync(email);
            if (user != null)
            {
                // 情況 A: 已經完全註冊好（有密碼） -> 叫他去登入
                // 只要 PasswordHash 有值，就代表已設定過密碼 
                if (!string.IsNullOrEmpty(user.PasswordHash))
                {
                    return Conflict(new { action = "redirect_login", message = "Email 已註冊，請直接登入。" });
                }

                // 情況 B: 已驗證信箱但還沒設密碼
                if (user.EmailConfirmed)
                {
                    _authService.SetPendingCookie(HttpContext, user.Email);
                    return Ok(new { verified = true, message = "此帳號已驗證成功，請直接設定密碼。" });
                }
            }

            // 情況 C: 完全沒有帳號的新使用者 - 創建新帳號
            if (user == null)
            {
                user = new ApplicationUser { UserName = email, Email = email };
                var createResult = await _userManager.CreateAsync(user);
                if (!createResult.Succeeded)
                    return BadRequest(new { message = "系統錯誤，請重新發送驗證信" });
            }

            // 1. 產生原始 Token
            var code = await _userManager.GenerateEmailConfirmationTokenAsync(user);

            // 2. 進行 Base64Url 編碼
            code = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));

            // 3. 生成連結指向
            var callbackUrl = Url.Action("ConfirmEmail", "Auth",
                new { userId = user.Id, code = code }, Request.Scheme);

            try
            {
                await _emailSender.SendConfirmationLinkAsync(user, email, callbackUrl!);

                _authService.SetPendingCookie(HttpContext, user.Email);

                // 如果使用記憶體方案，記錄寄送事件供 background service 使用
                try
                {
                    _store?.AddVerificationEmail(user.Id.ToString(), DateTime.UtcNow, "SendConfirmation invoked");
                }
                catch
                {
                    // non-fatal: 失敗不影響主要流程
                }

                return Ok(new { message = "驗證信已發送，請檢查信箱或垃圾郵件。" });
            }
            catch
            {
                // ★ 寄信失敗
                return BadRequest(new { message = "發送失敗，請稍後再試。" });
            }
        }


        // 註冊 (設定密碼) API
        [HttpPost("Register")]
        public async Task<IActionResult> Register([FromBody] Register model)
        {
            if (!Request.Cookies.TryGetValue("PendingEmail", out _))
            {
                return BadRequest(new { message = "驗證逾時，請重新驗證 Email" });
            }

            var user = await _userManager.FindByEmailAsync(model.Email);
            if (user == null || !user.EmailConfirmed)
            {
                return BadRequest(new { message = "請先完成Email驗證" });
            }

            var hasPassword = await _userManager.HasPasswordAsync(user);
            if (hasPassword)
            {
                return Conflict(new { message = "該帳號已完成設定，請直接登入" });
            }

            var resetToken = await _userManager.GeneratePasswordResetTokenAsync(user);
            var result = await _userManager.ResetPasswordAsync(user, resetToken, model.Password ?? string.Empty);

            if (result.Succeeded)
            {
                Response.Cookies.Delete("PendingEmail");
                return Ok(new
                {
                    success = true,
                    message = "帳戶設定成功！請登入",
                    redirectUrl = Url.Action("Login", "Auth")
                });
            }

            var errorMsg = result.Errors.FirstOrDefault()?.Description ?? "註冊失敗";
            return BadRequest(new { message = errorMsg, errors = result.Errors });
        }

        // 檢查 DB 狀態 (前端 Polling 用)
        [HttpGet("CheckDbStatus")]
        public async Task<IActionResult> CheckDbStatus()
        {
            if (!Request.Cookies.TryGetValue("PendingEmail", out var email))
            {
                return Ok(new { verified = false });
            }

            var user = await _userManager.FindByEmailAsync(email!);

            if (user != null && user.EmailConfirmed)
            {
                return Ok(new { verified = true, email });
            }

            return Ok(new { verified = false });
        }


        //檢查 Email 狀態
        [HttpPost("CheckEmailStatus")]
        public async Task<IActionResult> CheckEmailStatus([FromBody] string email)
        {
            var user = await _userManager.FindByEmailAsync(email);
            if (user != null && user.EmailConfirmed)
            {
                return Ok(new { verified = true });
            }

            return Ok(new { verified = false });
        }


        //發送重設密碼信件
        [HttpPost("SendPasswordReset")]
        public async Task<IActionResult> SendPasswordReset([FromBody] string email)
        {
            // 寄信前檢查：使用者不存在
            var user = await _userManager.FindByEmailAsync(email);
            var usedBackup = false;
            if (string.IsNullOrWhiteSpace(email))
            {
                return BadRequest(new { message = "請提供信箱。" });
            }

            if (user == null)
            {
                user = await _userManager.Users.FirstOrDefaultAsync(u => u.BackupEmail == email);
                usedBackup = user != null;
            }

            if (user == null)
            {
                return BadRequest(new { message = "此信箱尚未註冊，請先進行註冊。" });
            }
            if (!usedBackup)
            {
                // 寄信前檢查：Email 未驗證
                if (!await _userManager.IsEmailConfirmedAsync(user))
                {
                    return BadRequest(new { message = "此信箱尚未驗證，請先完成信箱驗證。" });
                }
            }
            else
            {
                if (!user.BackupEmailConfirmed)
                    return BadRequest(new { message = "此備援信箱尚未驗證，請先完成備援信箱驗證。" });
            }

            // 產生原始 Token
            var code = await _userManager.GeneratePasswordResetTokenAsync(user);

            // 進行 Base64Url 編碼
            code = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));

            // 生成重設連結
            var callbackUrl = Url.Action("VerifyPasswordResetLink", "Auth",
       new { userId = user.Id, code = code }, Request.Scheme);

            try
            {
                await _emailSender.SendPasswordResetLinkAsync(user, email, callbackUrl!);
                return Ok(new { message = "重設密碼信件已發送，請檢查信箱。" });
            }
            catch
            {
                // 寄信過程中發生錯誤
                return BadRequest(new { message = "發送失敗，請稍後再試。" });
            }
        }

        // 執行重設密碼
        // 對應 forgotPassword.js 的 AJAX 呼叫
        [HttpPost("PerformPasswordReset")]
        public async Task<IActionResult> PerformPasswordReset([FromBody] ResetPasswordModel? model)
        {
            if (model == null) return BadRequest(new { message = "無效的請求資料。" });

            if (!ModelState.IsValid)
            {
                return BadRequest(new { message = "無效的請求資料。" });
            }

            // 額外檢查空白值
            if (string.IsNullOrWhiteSpace(model.UserId) ||
                string.IsNullOrWhiteSpace(model.Code) ||
                string.IsNullOrWhiteSpace(model.Password))
            {
                return BadRequest(new { message = "所有欄位都是必填的。" });
            }

            var user = await _userManager.FindByIdAsync(model.UserId);
            if (user == null)
            {
                return BadRequest(new { message = "使用者不存在。" });
            }

            try
            {
                var decodedCode = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(model.Code));

                // 已驗證過
                var result = await _userManager.ResetPasswordAsync(user, decodedCode, model.Password!);

                if (result.Succeeded)
                {
                    return Ok(new { message = "密碼重設成功！" });
                }

                var errorMsg = result.Errors.FirstOrDefault()?.Description ?? "重設失敗";
                return BadRequest(new { message = errorMsg, errors = result.Errors });
            }
            catch
            {
                return BadRequest(new { message = "無效的驗證。" });
            }
        }

        // 驗證重設密碼連結


        // 驗證重設密碼連結有效性
        [HttpPost("ValidatePasswordResetLink")]
        public async Task<IActionResult> ValidatePasswordResetLink([FromBody] ValidatePasswordResetLinkModel model)
        {
            if (string.IsNullOrEmpty(model.UserId) || string.IsNullOrEmpty(model.Code))
            {
                return BadRequest(new { valid = false, message = "缺少必要參數" });
            }

            var user = await _userManager.FindByIdAsync(model.UserId);
            if (user == null)
            {
                return BadRequest(new { valid = false, message = "使用者不存在" });
            }

            try
            {
                // 進行 Base64Url 解碼
                var decodedCode = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(model.Code));

                // 驗證 code 是否有效（不實際執行重設）
                // 使用 UserManager 的驗證方法檢查 token 有效性
                var isValidToken = await _userManager.VerifyUserTokenAsync(user,
                    _userManager.Options.Tokens.PasswordResetTokenProvider,
                    "ResetPassword",
                    decodedCode);

                if (isValidToken)
                {
                    return Ok(new { valid = true, message = "連結有效" });
                }
                else
                {
                    return BadRequest(new { valid = false, message = "驗證碼已過期或已被使用" });
                }
            }
            catch
            {
                return BadRequest(new { valid = false, message = "驗證碼無效" });
            }
        }


        // 存儲重設密碼連結狀態（用戶點擊郵件連結時調用）
        [HttpPost("SetPasswordResetSession")]
        public IActionResult SetPasswordResetSession([FromBody] SetPasswordResetSessionModel model)
        {
            if (string.IsNullOrEmpty(model.UserId) || string.IsNullOrEmpty(model.Code))
            {
                return BadRequest(new { message = "缺少必要參數" });
            }

            // 儲存到 Session （有效期 24 小時）
            HttpContext.Session.SetString("PasswordResetUserId", model.UserId);
            HttpContext.Session.SetString("PasswordResetCode", model.Code);
            HttpContext.Session.SetString("PasswordResetTime", DateTime.UtcNow.ToString("O"));

            return Ok(new { message = "重設連結已儲存" });
        }

        //檢查用戶是否有有效的密碼重設連結
        [HttpPost("CheckPasswordResetSession")]
        public async Task<IActionResult> CheckPasswordResetSession()
        {
            var userId = HttpContext.Session.GetString("PasswordResetUserId");
            var code = HttpContext.Session.GetString("PasswordResetCode");
            var resetTimeStr = HttpContext.Session.GetString("PasswordResetTime");

            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(code))
            {
                return Ok(new { hasValidLink = false });
            }

            // 檢查連結是否過期（24 小時）
            if (DateTime.TryParse(resetTimeStr, out var resetTime))
            {
                if (DateTime.UtcNow - resetTime > TimeSpan.FromHours(24))
                {
                    // 清除過期的 Session
                    HttpContext.Session.Remove("PasswordResetUserId");
                    HttpContext.Session.Remove("PasswordResetCode");
                    HttpContext.Session.Remove("PasswordResetTime");
                    return Ok(new { hasValidLink = false, message = "連結已過期" });
                }
            }

            // 驗證連結是否仍然有效
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return Ok(new { hasValidLink = false });
            }

            try
            {
                var decodedCode = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code));
                var isValidToken = await _userManager.VerifyUserTokenAsync(user,
                    _userManager.Options.Tokens.PasswordResetTokenProvider,
                    "ResetPassword",
                    decodedCode);

                if (isValidToken)
                {
                    return Ok(new { hasValidLink = true, userId = userId, code = code });
                }
            }
            catch { }

            return Ok(new { hasValidLink = false, message = "連結無效或已被使用" });
        }

        //重設密碼完成後清除 Session
        [HttpPost("ClearPasswordResetSession")]
        public IActionResult ClearPasswordResetSession()
        {
            HttpContext.Session.Remove("PasswordResetUserId");
            HttpContext.Session.Remove("PasswordResetCode");
            HttpContext.Session.Remove("PasswordResetTime");
            return Ok(new { message = "已清除密碼重設資訊" });
        }

        // 新增：把原本 NotificationsController 的路由直接放在此 controller 中
        // 使用 ~ 前綴以指定絕對路徑，維持原來的 /api/notifications 路徑

        [HttpGet("~/api/notifications")]
        [Authorize]
        public IActionResult GetMyNotifications()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            var items = _store.GetNotifications(userId);
            return Ok(items);
        }

        [HttpPost("~/api/notifications/markread/{id:int}")]
        [Authorize]
        public IActionResult MarkRead(int id)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            if (_store.MarkNotificationRead(userId, id)) return Ok();
            return NotFound();
        }

        [HttpPost("~/api/notifications/dismissall")]
        [Authorize]
        public IActionResult DismissAll()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();
            _store.DismissAll(userId);
            return Ok();
        }

        private static Task<bool> IsValidImageAsync(IFormFile file)
        {
            if (file == null || string.IsNullOrEmpty(file.FileName))
                return Task.FromResult(false);

            var extension = Path.GetExtension(file.FileName);
            if (string.IsNullOrEmpty(extension) || !_imageSignatures.TryGetValue(extension, out var signatures))
                return Task.FromResult(false);

            // 讀取最長 signature 所需的位元組
            var maxSig = signatures.Max(s => s.Length);

            // 如果小於等於 128，使用 stackalloc 減少 heap 分配          
            Span<byte> header = maxSig <= 128 ? stackalloc byte[128].Slice(0, maxSig) : new byte[maxSig];

            try
            {
                using var stream = file.OpenReadStream();
                // MemoryStream/Stream 支援 Read(Span<byte>) 的情況下會避免額外的陣列分配
                var totalRead = 0;
                while (totalRead < maxSig)
                {
                    var read = stream.Read(header.Slice(totalRead));
                    if (read == 0) break;
                    totalRead += read;
                }

                if (totalRead == 0) return Task.FromResult(false);

                foreach (var sig in signatures)
                {
                    if (totalRead >= sig.Length && header.Slice(0, sig.Length).SequenceEqual(sig))
                        return Task.FromResult(true);
                }

                return Task.FromResult(false);
            }
            catch
            {
                return Task.FromResult(false);
            }
        }


        // Private helper：與前端 Validator 一致的密碼規則檢查
        private static (bool IsValid, string Message, string[] MissingRules) ValidatePasswordRules(string password)
        {
            var missing = new List<string>();

            if (string.IsNullOrEmpty(password) || password.Length < 6 || password.Length > 18) missing.Add("6~18位");
            if (!password.Any(char.IsUpper)) missing.Add("大寫英文");
            if (!password.Any(char.IsLower)) missing.Add("小寫英文");
            if (!password.Any(char.IsDigit)) missing.Add("數字");

            if (missing.Count == 0) return (true, "密碼格式符合規則", Array.Empty<string>());
            return (false, "需包含：" + string.Join("、", missing), missing.ToArray());
        }

        // 更新 GetMemberProfile：儲存與回傳皆以原始 Unicode 字串為主，僅對舊資料偵測並解碼
        [HttpGet("GetMemberProfile")]
        [Authorize]
        public async Task<IActionResult> GetMemberProfile()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId) || !int.TryParse(userId, out var intUserId))
                return NotFound(new { success = false, message = "找不到使用者" });

            var userRecord = await _dbContext.AspNetUsers
                .AsNoTracking()
                .Where(u => u.UserId == intUserId)
                .Select(u => new
                {
                    u.Email,
                    u.BackupEmail,
                    Avatar = u.Avatar,
                    FullName = u.FullName
                })
                .FirstOrDefaultAsync();

            if (userRecord == null)
                return NotFound(new { success = false, message = "找不到使用者" });

            string fullNameToReturn;
            if (string.IsNullOrWhiteSpace(userRecord.FullName))
            {
                // DB 無值：用 Email @ 前段當預設，並嘗試寫回（直接存 Unicode）
                var defaultName = (userRecord.Email ?? "").Split('@').FirstOrDefault() ?? "未設定";
                fullNameToReturn = defaultName;

                try
                {
                    var userEntity = await _userManager.FindByIdAsync(userId);
                    if (userEntity != null && string.IsNullOrWhiteSpace(userEntity.FullName))
                    {
                        userEntity.FullName = defaultName; // 直接存 Unicode
                        await _userManager.UpdateAsync(userEntity);
                    }
                }
                catch
                {
                    // 寫回失敗不影響回傳
                }
            }
            else
            {
                // 若資料庫仍殘留舊的 URL-encoded 字串，嘗試解碼；否則直接回傳原值
                fullNameToReturn = DecodeFullNameIfNeeded(userRecord.FullName);
            }

            return Ok(new
            {
                success = true,
                email = userRecord.Email,
                backupEmail = userRecord.BackupEmail,
                avatar = userRecord.Avatar,
                fullName = fullNameToReturn
            });
        }

        // 上傳頭像 API
        [HttpPost("UploadAvatar")]
        [Authorize]
        [RequestSizeLimit(5 * 1024 * 1024)]
        public async Task<IActionResult> UploadAvatar(IFormFile avatarFile)
        {


            if (avatarFile == null || avatarFile.Length == 0)
            {
                return BadRequest(new { success = false, message = "請選擇圖片檔案" });
            }

            const long maxFileSize = 2 * 1024 * 1024; // 2 MB
            if (avatarFile.Length > maxFileSize)
            {
                return BadRequest(new { success = false, message = "檔案大小超過限制 2 MB" });
            }

            var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { ".jpg", ".jpeg", ".png", ".gif" };
            var extension = Path.GetExtension(avatarFile.FileName);
            if (string.IsNullOrEmpty(extension))
            {
                return BadRequest(new { success = false, message = "僅支援 JPG、PNG、GIF 格式" });
            }

            var allowedMimeTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
             {
               "image/jpeg", "image/png", "image/gif", "image/jpg"
            };
            if (!allowedMimeTypes.Contains(avatarFile.ContentType))
            {
                return BadRequest(new { success = false, message = "不支援的圖片格式" });
            }
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = await _userManager.FindByIdAsync(userId!);
            if (user == null)
            {
                return NotFound(new { success = false, message = "找不到使用者" });
            }
            try
            {
                // 7. 建立專用的上傳資料夾（與應用程式分離）
                var uploadsFolder = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "Uploads", "Avatars");
                if (!Directory.Exists(uploadsFolder))
                {
                    Directory.CreateDirectory(uploadsFolder);
                }

                // 8. 刪除舊頭像檔案（如果是本地檔案）
                if (!string.IsNullOrEmpty(user.Avatar) && user.Avatar.StartsWith("/Uploads/Avatars/"))
                {
                    var oldFilePath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", user.Avatar.TrimStart('/'));
                    if (System.IO.File.Exists(oldFilePath))
                    {
                        System.IO.File.Delete(oldFilePath);
                    }
                }

                // 9. 產生安全的唯一檔名（不使用使用者提供的檔名）
                var safeFileName = $"{Guid.NewGuid()}{extension.ToLowerInvariant()}";
                var filePath = Path.Combine(uploadsFolder, safeFileName);

                // 10. 儲存檔案
                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await avatarFile.CopyToAsync(stream);
                }

                // 11. 更新資料庫
                var avatarUrl = $"/Uploads/Avatars/{safeFileName}";
                user.Avatar = avatarUrl;
                var result = await _userManager.UpdateAsync(user);

                if (result.Succeeded)
                {
                    // 12. 重新產生 JWT Token（更新 Avatar Claim）
                    var token = _authService.GenerateJwtToken(user);
                    _authService.SetAuthCookie(HttpContext, token);

                    return Ok(new
                    {
                        success = true,
                        message = "頭像上傳成功",
                        avatarUrl = avatarUrl
                    });
                }

                // 上傳成功但資料庫更新失敗，刪除已上傳的檔案
                if (System.IO.File.Exists(filePath))
                {
                    System.IO.File.Delete(filePath);
                }

                return BadRequest(new { success = false, message = "更新失敗，請稍後再試" });
            }
            catch
            {
                return StatusCode(500, new { success = false, message = "上傳過程發生錯誤，請稍後再試" });
            }
        }



        [HttpGet("ConfirmEmail")]
        public async Task<IActionResult> ConfirmEmail(string userId, string code)
        {
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(code))
            {
                return BadRequest(new { success = false, message = "無效的驗證連結。" });
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return BadRequest(new { success = false, message = "用戶不存在。" });
            }

            // 解碼 code（配合 AuthService 的 Base64UrlEncode）
            var decodedCode = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code));
            var result = await _userManager.ConfirmEmailAsync(user, decodedCode);

            if (result.Succeeded)
            {
                // 成功：返回 JSON（供 AJAX 使用）
                // 若使用 in-memory 通知，註冊已驗證時可以自動清除該使用者相關提醒
                try
                {
                    // 把該使用者的所有 EmailVerificationReminder 類型通知標示為已讀
                    var notifs = _store.GetNotifications(user.Id.ToString());
                    foreach (var n in notifs.Where(x => string.Equals(x.Type, "EmailVerificationReminder", StringComparison.OrdinalIgnoreCase)))
                    {
                        _store.MarkNotificationRead(user.Id.ToString(), n.Id);
                    }
                }
                catch
                {
                    // ignore
                }

                return Ok(new { success = true, message = "Email 驗證成功！" });
            }
            else
            {
                // 失敗：返回錯誤 JSON
                return BadRequest(new { success = false, message = "Email 驗證失敗：" + string.Join(", ", result.Errors.Select(e => e.Description)) });
            }
        }




        public class SaveLeavesModel
        {
            public string[]? Added { get; set; } = Array.Empty<string>();
            public string[]? Removed { get; set; } = Array.Empty<string>();
        }

        // 示範：增量同步（刪除 Removed，插入 Added 中尚不存在的）
        [HttpPost("SaveLeaves")]
        [Authorize]
        public async Task<IActionResult> SaveLeaves([FromBody] SaveLeavesModel? model)
        {
            if (model == null) return BadRequest(new { success = false, message = "無效請求" });

            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(userIdClaim, out var userId)) return Unauthorized();

            try
            {
                // 1. 解析日期並過濾掉「今天以前」的日期 (後端防護)
                var today = DateOnly.FromDateTime(DateTime.Today);
                // 處理 Added：解析 -> 過濾今天以前 -> 轉為 HashSet
                var added = (model.Added ?? Array.Empty<string>())
                    .Select(s => DateOnly.ParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture))
                    .Where(d => d >= today)
                    .ToHashSet();

                // 處理 Removed：解析 -> 轉為 HashSet
                var removed = (model.Removed ?? Array.Empty<string>())
                    .Select(s => DateOnly.ParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture))
                    .ToHashSet();

                await using var tx = await _dbContext.Database.BeginTransactionAsync();

                // 2. 執行刪除 (差集邏輯：使用者點選 X 的已儲存日期)
                if (removed.Count > 0)
                {
                    await _dbContext.LeaveDates
                        .Where(l => l.UserId == userId && l.LeaveDate1.HasValue && removed.Contains(l.LeaveDate1.Value))
                        .ExecuteDeleteAsync();
                }

                // 3. 執行新增 (聯集邏輯：排除已存在的日期避免重複 Insert)
                var existingDates = await _dbContext.LeaveDates
                    .Where(l => l.UserId == userId && l.LeaveDate1.HasValue && added.Contains(l.LeaveDate1.Value))
                    .Select(l => l.LeaveDate1!.Value)
                    .ToListAsync();

                var toInsert = added.Except(existingDates).Select(d => new LeaveDate
                {
                    UserId = userId,
                    LeaveDate1 = d,
                    LeaveDateAt = DateTime.Now // 紀錄儲存時間
                }).ToList();

                if (toInsert.Count > 0)
                {
                    await _dbContext.LeaveDates.AddRangeAsync(toInsert);
                    await _dbContext.SaveChangesAsync();
                }

                await tx.CommitAsync();
                return Ok(new { success = true, addedCount = toInsert.Count, removedCount = removed.Count });
            }
            catch (Exception)
            {
                // 應記錄例外到 Logger
                return StatusCode(500, new { success = false, message = "系統儲存發生錯誤" });
            }
        }

        [HttpPost("DeleteLeaves")]
        [Authorize]
        public async Task<IActionResult> DeleteLeaves([FromBody] string[]? dates)
        {
            if (dates == null || dates.Length == 0) return BadRequest(new { success = false, message = "沒有提供日期" });

            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!int.TryParse(userIdClaim, out var userId)) return Unauthorized();

            var parsed = dates
                .Select(s => DateOnly.ParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture))
                .ToHashSet();

            await _dbContext.LeaveDates
                .Where(l => l.UserId == userId && l.LeaveDate1.HasValue && parsed.Contains(l.LeaveDate1.Value))
                .ExecuteDeleteAsync();

            return Ok(new { success = true });
        }



        private static string? ParseFirstPhotoFromSnapshot(string photosSnapshot)
        {
            // 嘗試解析常見的 JSON 陣列格式或直接是 URL 的情況，回傳第一張可用的 URL（否則回傳 null ）
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(photosSnapshot);
                var root = doc.RootElement;
                if (root.ValueKind == System.Text.Json.JsonValueKind.Array && root.GetArrayLength() > 0)
                {
                    var first = root[0];
                    if (first.ValueKind == System.Text.Json.JsonValueKind.String)
                    {
                        var s = first.GetString();
                        if (!string.IsNullOrEmpty(s)) return s;
                      }
                      else if (first.ValueKind == System.Text.Json.JsonValueKind.Object)
                      {
                          if (first.TryGetProperty("url", out var urlProp) && urlProp.ValueKind == System.Text.Json.JsonValueKind.String)
                              return urlProp.GetString();
                          // 若物件只有 photo_reference，無法直接構成 URL，回傳 null 讓前端使用 fallback
                      }
                }
                else if (root.ValueKind == System.Text.Json.JsonValueKind.String)
                {
                    var s = root.GetString();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
            }
            catch
            {
                // 忽略解析錯誤
            }

            return null;
        }

        [HttpPost("SendBackupLookup")]
        public async Task<IActionResult> SendBackupLookup([FromBody] string backupEmail)
        {
            if (string.IsNullOrWhiteSpace(backupEmail))
                return BadRequest(new { message = "請提供備援信箱" });

            var user = await _userManager.Users.FirstOrDefaultAsync(u => u.BackupEmail == backupEmail);
            if (user == null)
                return BadRequest(new { message = "找不到該備援信箱" });

            if (string.Equals(user.Email, backupEmail, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "備援信箱不得與主信箱相同" });

            // 產生驗證 token（Base64Url 編碼），寄到使用者的備援信箱
            var code = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            code = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));

            var callbackUrl = Url.Action("ConfirmBackupLookup", "AuthApi", new { userId = user.Id, code }, Request.Scheme);
            try
            {
                await _emailSender.SendConfirmationLinkAsync(user, backupEmail, callbackUrl!);
                return Ok(new { message = "已寄出驗證信，請至備援信箱點擊連結以驗證。" });
            }
            catch
            {
                return StatusCode(500, new { message = "寄信失敗，請稍後再試。" });
            }
        }

        [HttpGet("ConfirmBackupLookup")]
        public async Task<IActionResult> ConfirmBackupLookup(string userId, string code)
        {
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(code))
                return BadRequest("無效的驗證連結");

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return BadRequest("使用者不存在");

            try
            {
                var decoded = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code));
                // 驗證 token（不變更任何 EmailConfirmed 狀態）
                var isValid = await _userManager.VerifyUserTokenAsync(user,
                    _userManager.Options.Tokens.EmailConfirmationTokenProvider,
                    "EmailConfirmation",
                    decoded);

                if (!isValid) return BadRequest("驗證失敗或已過期");

                // 產生 password reset token 並把它存入 Session（與 ForgotPassword 的流程相容）
                var pwdToken = await _userManager.GeneratePasswordResetTokenAsync(user);
                var pwdTokenEncoded = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(pwdToken));

                HttpContext.Session.SetString("PasswordResetUserId", user.Id.ToString());
                HttpContext.Session.SetString("PasswordResetCode", pwdTokenEncoded);
                HttpContext.Session.SetString("PasswordResetTime", DateTime.UtcNow.ToString("O"));

                // 設定一個臨時 flag 以供前端取得主帳號（顯示帳號名稱）
                HttpContext.Session.SetString("BackupLookupUserId", user.Id.ToString());
                HttpContext.Session.SetString("BackupLookupTime", DateTime.UtcNow.ToString("O"));

                _logger?.LogInformation("ConfirmBackupLookup: set BackupLookupUserId={UserId}", user.Id);

                // 轉回前端 ForgotEmail 頁面（前端會辨識 query string 並取結果）
                return Redirect($"{Url.Action("ForgotEmail", "Auth")}?backupVerified=1");
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "ConfirmBackupLookup failed for userId={UserId}", userId);
                return BadRequest("驗證處理失敗");
            }
        }

        [HttpGet("GetBackupLookupResult")]
        public async Task<IActionResult> GetBackupLookupResult()
        {
            var userId = HttpContext.Session.GetString("BackupLookupUserId");
            _logger?.LogInformation("GetBackupLookupResult: session BackupLookupUserId={UserId}", userId);

            if (string.IsNullOrEmpty(userId))
            {
                // 改為不回 400，而是回 200 + verified=false，讓前端可以用統一流程處理（不當作錯誤）
                _logger?.LogInformation("GetBackupLookupResult: no BackupLookupUserId in session");
                return Ok(new { verified = false, message = "沒有驗證紀錄" });
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                _logger?.LogWarning("GetBackupLookupResult: user not found for BackupLookupUserId={UserId}", userId);
                return Ok(new { verified = false, message = "使用者不存在" });
            }

            _logger?.LogInformation("GetBackupLookupResult: returning userId={UserId}, email={Email}", user.Id, user.Email);

            return Ok(new
            {
                verified = true,
                userId = user.Id,
                email = user.Email
            });
        }

        [HttpPost("ClearBackupLookupSession")]
        public IActionResult ClearBackupLookupSession()
        {
            try
            {
                HttpContext.Session.Remove("BackupLookupUserId");
                HttpContext.Session.Remove("BackupLookupTime");

                // 同時清除與重設密碼流程有關的 Session（避免遺留）
                HttpContext.Session.Remove("PasswordResetUserId");
                HttpContext.Session.Remove("PasswordResetCode");
                HttpContext.Session.Remove("PasswordResetTime");

                _logger?.LogInformation("ClearBackupLookupSession: cleared backup & password reset session keys");
                return Ok(new { message = "驗證狀態已清除" });
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "ClearBackupLookupSession failed");
                return StatusCode(500, new { message = "清除驗證狀態失敗" });
            }
        }

        // 保留兼容舊資料的解碼輔助：只有在欄位看起來像 URL-encoded 時解碼
        private static string DecodeFullNameIfNeeded(string? fullName)
        {
            if (string.IsNullOrEmpty(fullName))
                return string.Empty;

            try
            {
                return LooksLikeUrlEncoded(fullName) ? System.Net.WebUtility.UrlDecode(fullName) : fullName;
            }
            catch
            {
                return fullName;
            }
        }

        private static bool LooksLikeUrlEncoded(string s)
        {
            if (string.IsNullOrEmpty(s)) return false;
            for (int i = 0; i < s.Length - 2; i++)
            {
                if (s[i] == '%' && IsHexChar(s[i + 1]) && IsHexChar(s[i + 2]))
                    return true;
            }
            return false;
        }

        private static bool IsHexChar(char c)
        {
            return (c >= '0' && c <= '9') ||
                   (c >= 'a' && c <= 'f') ||
                   (c >= 'A' && c <= 'F');
        }

        [HttpPost("ImportCalendarJson")]
        [Authorize]
        [RequestSizeLimit(5 * 1024 * 1024)]
        public async Task<IActionResult> ImportCalendarJson([FromForm] IFormFile? file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { success = false, message = "請上傳 JSON 檔案" });

            string content;
            try
            {
                using var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8);
                content = await reader.ReadToEndAsync();
            }
            catch
            {
                return StatusCode(500, new { success = false, message = "讀取檔案失敗" });
            }

            var parsed = new List<DateOnly>();
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(content);
                var root = doc.RootElement;

                if (root.ValueKind == System.Text.Json.JsonValueKind.Object && root.TryGetProperty("dates", out var datesProp) && datesProp.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var el in datesProp.EnumerateArray())
                    {
                        if (el.ValueKind == System.Text.Json.JsonValueKind.String &&
                            DateOnly.TryParseExact(el.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                        {
                            parsed.Add(d);
                        }
                    }
                }
                else if (root.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var el in root.EnumerateArray())
                    {
                        if (el.ValueKind == System.Text.Json.JsonValueKind.String &&
                            DateOnly.TryParseExact(el.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                        {
                            parsed.Add(d);
                        }
                    }
                }
                else
                {
                    return BadRequest(new { success = false, message = "JSON 格式不支援，請使用 dates 陣列或字串陣列。" });
                }
            }
            catch
            {
                return BadRequest(new { success = false, message = "無效的 JSON 檔案" });
            }

            if (!parsed.Any())
                return BadRequest(new { success = false, message = "未解析到可用日期 (格式 yyyy-MM-dd)" });

            var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(claim) || !int.TryParse(claim, out var userId))
                return Unauthorized(new { success = false, message = "未登入或無效使用者" });

            // 取得使用者的已鎖定行程區間
            var lockedRanges = await _dbContext.TripMembers
                .AsNoTracking()
                .Where(tm => tm.UserId == userId)
                .Select(tm => new { Start = tm.Trip.StartDate, End = tm.Trip.EndDate })
                .Where(r => r.Start != default && r.End != default)
                .ToListAsync();

            var today = DateOnly.FromDateTime(DateTime.Today);

            // 過濾：排除鎖定區間並只保留今天或之後
            var accepted = parsed
                .Where(d => d >= today && !lockedRanges.Any(r => d >= r.Start && d <= r.End))
                .Distinct()
                .OrderBy(d => d)
                .ToList();

            var rejected = parsed.Except(accepted).Distinct().OrderBy(d => d).ToList();

            // 寫入資料庫：避免重複、使用 transaction
            try
            {
                await using var tx = await _dbContext.Database.BeginTransactionAsync();

                var existingDates = await _dbContext.LeaveDates
                    .Where(l => l.UserId == userId && l.LeaveDate1.HasValue && accepted.Contains(l.LeaveDate1.Value))
                    .Select(l => l.LeaveDate1!.Value)
                    .ToListAsync();

                var toInsert = accepted.Except(existingDates).Select(d => new LeaveDate
                {
                    UserId = userId,
                    LeaveDate1 = d,
                    LeaveDateAt = DateTime.Now
                }).ToList();

                if (toInsert.Count > 0)
                {
                    await _dbContext.LeaveDates.AddRangeAsync(toInsert);
                    await _dbContext.SaveChangesAsync();
                }

                await tx.CommitAsync();
            }
            catch (Exception)
            {
                return StatusCode(500, new { success = false, message = "儲存至資料庫失敗" });
            }

            // 保留原本把 accepted 存到 Session 的行為（供前端流程使用）
            try
            {
                var acceptStrs = accepted.Select(d => d.ToString("yyyy-MM-dd")).ToArray();
                HttpContext.Session.SetString("ImportedCalendarDates", System.Text.Json.JsonSerializer.Serialize(acceptStrs));
            }
            catch { /* non-fatal */ }

            return Ok(new
            {
                success = true,
                message = "已匯入日曆（已過濾衝突與過去日期）",
                acceptedDates = accepted.Select(d => d.ToString("yyyy-MM-dd")).ToArray(),
                rejectedDates = rejected.Select(d => d.ToString("yyyy-MM-dd")).ToArray()
            });
        }


        // 更新 UpdateFullName：直接存入原始 Unicode（string）
        [HttpPost("UpdateFullName")]
        [Authorize]
        public async Task<IActionResult> UpdateFullName([FromBody] UpdateFullNameModel? model)
        {
            if (model == null || string.IsNullOrWhiteSpace(model.FullName))
                return BadRequest(new { success = false, message = "名稱不可為空" });

            var name = model.FullName.Trim();
            if (name.Length > 25)
                return BadRequest(new { success = false, message = "名稱長度不能超過25字" });

            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out _))
                return Unauthorized();

            var user = await _userManager.FindByIdAsync(userIdClaim);
            if (user == null) return NotFound(new { success = false, message = "找不到使用者" });

            // 直接存原始 Unicode，不再 UrlEncode
            user.FullName = name;

            var result = await _userManager.UpdateAsync(user);
            if (result.Succeeded)
            {
                try
                {
                    var token = _authService.GenerateJwtToken(user);
                    _authService.SetAuthCookie(HttpContext, token);
                }
                catch { /* 非致命 */ }

                return Ok(new { success = true, message = "自訂名稱已更新" });
            }

            var errorMsg = result.Errors.FirstOrDefault()?.Description ?? "更新失敗";
            return BadRequest(new { success = false, message = errorMsg, errors = result.Errors });
        }
    }
}