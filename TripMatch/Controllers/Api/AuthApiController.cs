using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SendGrid.Helpers.Mail;
using System;
using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using TripMatch.Models;
using TripMatch.Models.Settings;
using TripMatch.Services;
using static TripMatch.Services.AuthServicesExtensions;

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
        private readonly IDataProtector _dataProtector;
        private readonly TravelDbContext _travelDbContext;
        private readonly IConfiguration _configuration;
        private readonly PlacesImageService _placesImageService;

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
     ILogger<AuthApiController> logger,
     IDataProtectionProvider dataProtectionProvider,
     TravelDbContext travelDbContext,
    IConfiguration configuration,
    PlacesImageService placesImageService
     )
        {
            _signInManager = signInManager;
            _userManager = userManager;
            _authService = authService;
            _emailSender = emailSender;
            _dbContext = dbContext;
            _tagUserId = tagUserId;
            _logger = logger;
            _dataProtector = dataProtectionProvider.CreateProtector("TripMatch.PendingBackupEmail");
            _travelDbContext = travelDbContext;
            _configuration = configuration;
            _placesImageService = placesImageService;
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
        //[IgnoreAntiforgeryToken]//暫時忽略Token
        public async Task<IActionResult> Signin()
        {
            try
            {
                // Log headers & cookies for diagnosis
                try
                {
                    var hdrs = Request.Headers.ToDictionary(h => h.Key, h => string.Join(";", h.Value));
                    _logger?.LogInformation("Signin request headers: {@hdrs}", hdrs);

                    var cks = Request.Cookies.ToDictionary(c => c.Key, c => c.Value);
                    _logger?.LogInformation("Signin request cookies: {@cks}", cks);
                }
                catch { /* 不阻斷正常流程 */ }

                // Read raw body (if any)
                string rawBody = string.Empty;
                if (Request.ContentLength > 0)
                {
                    // Enable rewind not necessary here if body not read earlier
                    using var reader = new StreamReader(Request.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
                    rawBody = await reader.ReadToEndAsync();
                    _logger?.LogInformation("Signin raw body: {rawBody}", rawBody);
                    // rewind stream for future readers (defensive)
                    try { Request.Body.Position = 0; } catch { }
                }

                string? email = null;
                string? password = null;

                // 1) 支援 Content-Type: application/x-www-form-urlencoded 或 multipart/form-data
                if (Request.HasFormContentType)
                {
                    var form = await Request.ReadFormAsync();
                    email = form["Email"].FirstOrDefault() ?? form["email"].FirstOrDefault();
                    password = form["Password"].FirstOrDefault() ?? form["password"].FirstOrDefault();
                    _logger?.LogInformation("Signin parsed from form: email present={EmailPresent}", !string.IsNullOrEmpty(email));
                }
                // 2) 支援 JSON body
                else if (!string.IsNullOrWhiteSpace(rawBody))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(rawBody);
                        var root = doc.RootElement;
                        if (root.ValueKind == JsonValueKind.Object)
                        {
                            if (root.TryGetProperty("Email", out var e1) && e1.ValueKind == JsonValueKind.String) email = e1.GetString();
                            else if (root.TryGetProperty("email", out var e2) && e2.ValueKind == JsonValueKind.String) email = e2.GetString();

                            if (root.TryGetProperty("Password", out var p1) && p1.ValueKind == JsonValueKind.String) password = p1.GetString();
                            else if (root.TryGetProperty("password", out var p2) && p2.ValueKind == JsonValueKind.String) password = p2.GetString();
                        }
                    }
                    catch (JsonException jex)
                    {
                        _logger?.LogWarning(jex, "Signin JSON parse failed");
                        return BadRequest(new { success = false, message = "無效的 JSON。" });
                    }
                }

                email = email?.Trim();

                if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
                {
                    _logger?.LogInformation("Signin missing credentials. email present={EmailPresent}", !string.IsNullOrEmpty(email));
                    return BadRequest(new { success = false, message = "請提供 Email 與 Password。" });
                }

                var result = await _signInManager.PasswordSignInAsync(email, password, isPersistent: false, lockoutOnFailure: true);
                ApplicationUser? user = null;

                if (result.Succeeded)
                {
                    user = await _userManager.FindByEmailAsync(email);
                    if (user != null)
                    {
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
                    user = await _userManager.FindByEmailAsync(email);
                }

                if (result.IsLockedOut)
                {
                    return StatusCode(423, new { success = false, message = "帳號已被鎖定，請稍後再試。" });
                }

                var accessFailedCount = user != null ? await _userManager.GetAccessFailedCountAsync(user) : 0;
                var remainingAttempts = 5 - accessFailedCount;

                return BadRequest(new { success = false, message = $"帳號或密碼錯誤。剩餘嘗試次數：{remainingAttempts}" });
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "Signin error");
                return StatusCode(500, new { success = false, message = "系統錯誤，請稍後再試。" });
            }
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
        // Replace the existing SendConfirmation method with this one
        [HttpPost("SendConfirmation")]
        public async Task<IActionResult> SendConfirmation([FromBody] string email)
        {
            if (string.IsNullOrWhiteSpace(email))
                return BadRequest(new { message = "請提供 Email" });

            email = email.Trim();
            var lower = email.ToLowerInvariant();

            // 1. 先從資料庫查是否存在此使用者 (同時檢查主信箱與備援信箱)
            var existing = await _userManager.Users
                .FirstOrDefaultAsync(u =>
                    (u.Email != null && u.Email.ToLower() == lower) ||
                    (u.BackupEmail != null && u.BackupEmail.ToLower() == lower));

            if (existing != null)
            {
                // 情況 A：如果是主信箱匹配
                if (!string.IsNullOrEmpty(existing.Email) && string.Equals(existing.Email.Trim(), email, StringComparison.OrdinalIgnoreCase))
                {
                    // 已設定密碼 -> 已註冊，叫他去登入
                    if (!string.IsNullOrEmpty(existing.PasswordHash))
                        return Conflict(new { action = "redirect_login", message = "Email 已註冊，請直接登入。" });

                    // 已驗證但尚未設定密碼 -> 直接通關！不用寄信
                    if (await _userManager.IsEmailConfirmedAsync(existing))
                    {
                        _authService.SetPendingCookie(HttpContext, existing.Email);
                        return Ok(new
                        {
                            action = "already_confirmed",
                            message = "此信箱已完成驗證，請直接設定密碼。",
                            email = existing.Email
                        });
                    }
                    // 尚未驗證：則繼續執行後面的寄信流程
                }
                else // 情況 B：如果是備援信箱匹配
                {
                    if (existing.BackupEmailConfirmed)
                    {
                        return Ok(new { action = "backup_already_confirmed", message = "此信箱已作為備援信箱驗證過。" });
                    }
                }
            }

            // 2. 若找不到現存紀錄，才建立新的暫存使用者
            ApplicationUser? userToUse = existing;
            if (userToUse == null)
            {
                userToUse = new ApplicationUser { UserName = email, Email = email };
                var createResult = await _userManager.CreateAsync(userToUse);
                if (!createResult.Succeeded) return BadRequest(new { message = "系統錯誤，請重新發送" });
            }

            // 3. 執行寄信流程 (只有沒驗證過的人才會走到這裡)
            var code = await _userManager.GenerateEmailConfirmationTokenAsync(userToUse);
            var encodedCode = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));
            var callbackUrl = Url.Action("ConfirmEmail", "Auth", new { userId = userToUse.Id, code = encodedCode }, Request.Scheme);

            try
            {
                await _emailSender.SendConfirmationLinkAsync(userToUse, email, callbackUrl!);
                _authService.SetPendingCookie(HttpContext, userToUse.Email);
                return Ok(new { message = "驗證信已發送，請檢查信箱。" });
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "發送失敗");
                return BadRequest(new { message = "寄信失敗，但您可以稍後再試，或檢查資料庫狀態。" });
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
            try
            {
                // 1) 先處理正常 PendingEmail（註冊 / 主信箱流程）
                if (Request.Cookies.TryGetValue("PendingEmail", out var pendingEmail) && !string.IsNullOrEmpty(pendingEmail))
                {
                    var user = await _userManager.FindByEmailAsync(pendingEmail);
                    if (user != null)
                    {
                        // 回傳主信箱驗證狀態，同時也回傳備援狀態（如果有）
                        return Ok(new
                        {
                            verified = user.EmailConfirmed,
                            backupVerified = user.BackupEmailConfirmed,
                            email = pendingEmail
                        });
                    }

                    // 如果 cookie 存但找不到使用者，清除 cookie 並回傳 false
                    Response.Cookies.Delete("PendingEmail");
                    return Ok(new { verified = false, backupVerified = false });
                }

                // 2) 再處理備援信箱流程：BackupLookupPending cookie（由 ConfirmBackupLookup 設置）
                if (Request.Cookies.TryGetValue("BackupLookupPending", out var backupCookie) && !string.IsNullOrEmpty(backupCookie))
                {
                    try
                    {
                        // 嘗試 Base64Url decode 成 protected payload（與 GetBackupLookupResult 一致）
                        string protectedPayload;
                        try
                        {
                            var decoded = WebEncoders.Base64UrlDecode(backupCookie);
                            protectedPayload = Encoding.UTF8.GetString(decoded);
                        }
                        catch
                        {
                            // 如果 decode 失敗，當作 raw protected payload
                            protectedPayload = backupCookie;
                        }

                        // Unprotect 得到原始 JSON
                        string json = _dataProtector.Unprotect(protectedPayload);

                        using var doc = JsonDocument.Parse(json);
                        var root = doc.RootElement;

                        // 取 email 與 expiresAt（容錯）
                        string? lookupEmail = null;
                        if (root.TryGetProperty("email", out var emailProp) && emailProp.ValueKind == JsonValueKind.String)
                        {
                            lookupEmail = emailProp.GetString();
                        }

                        DateTime expiresAtUtc = DateTime.MinValue;
                        bool hasExpiry = false;
                        if (root.TryGetProperty("expiresAt", out var expiresProp))
                        {
                            try
                            {
                                expiresAtUtc = expiresProp.GetDateTime().ToUniversalTime();
                                hasExpiry = true;
                            }
                            catch
                            {
                                if (expiresProp.ValueKind == JsonValueKind.String &&
                                    DateTime.TryParse(expiresProp.GetString(), out var parsed))
                                {
                                    expiresAtUtc = parsed.ToUniversalTime();
                                    hasExpiry = true;
                                }
                            }
                        }

                        if (string.IsNullOrEmpty(lookupEmail) || !hasExpiry || expiresAtUtc < DateTime.UtcNow)
                        {
                            Response.Cookies.Delete("BackupLookupPending");
                            return Ok(new { verified = false, backupVerified = false });
                        }

                        var lower = lookupEmail.ToLowerInvariant();

                        // 先查是否為別人的備援信箱（回傳對應主帳號 email）
                        var userByBackup = await _userManager.Users.FirstOrDefaultAsync(u => u.BackupEmail != null && u.BackupEmail.ToLower() == lower);
                        if (userByBackup != null)
                        {
                            // 備援驗證已完成（ConfirmBackupLookup 寫入時才會到這裡）
                            return Ok(new
                            {
                                verified = false,
                                backupVerified = true,
                                lookupEmail = lookupEmail,
                                email = userByBackup.Email
                            });
                        }

                        // 若不是別人的備援信箱，再檢查是否為已驗證的主信箱
                        var userByPrimaryConfirmed = await _userManager.Users.FirstOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == lower && u.EmailConfirmed);
                        if (userByPrimaryConfirmed != null)
                        {
                            return Ok(new
                            {
                                verified = false,
                                backupVerified = true,
                                lookupEmail = lookupEmail,
                                email = userByPrimaryConfirmed.Email
                            });
                        }

                        // 無對應帳號或未驗證情況
                        Response.Cookies.Delete("BackupLookupPending");
                        return Ok(new { verified = false, backupVerified = false });
                    }
                    catch (Exception ex)
                    {
                        _logger?.LogWarning(ex, "CheckDbStatus: processing BackupLookupPending failed");
                        Response.Cookies.Delete("BackupLookupPending");
                        return Ok(new { verified = false, backupVerified = false });
                    }
                }

                // 3) 都沒有 cookie：回傳未驗證
                return Ok(new { verified = false, backupVerified = false });
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "CheckDbStatus unexpected error");
                return StatusCode(500, new { verified = false, backupVerified = false });
            }
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
                    return BadRequest(new { message = "尚未驗證，請先完成驗證。" });
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
                // MemoryStream/Stream 美元支援 Read(Span<byte>) 的情況下會避免額外的陣列分配
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


        [HttpGet("GetMemberProfile")]
        [Authorize]
        public async Task<IActionResult> GetMemberProfile()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId) || !int.TryParse(userId, out var intUserId))
                return NotFound(new { success = false, message = "找不到使用者" });

            // 一次查出需要的欄位（包含 BackupEmailConfirmed）
            var userRecord = await _dbContext.AspNetUsers
                .AsNoTracking()
                .Where(u => u.UserId == intUserId)
                .Select(u => new
                {
                    u.Email,
                    u.BackupEmail,
                    u.BackupEmailConfirmed,
                    Avatar = u.Avatar,
                    FullName = u.FullName
                })
                .FirstOrDefaultAsync();

            if (userRecord == null)
                return NotFound(new { success = false, message = "找不到使用者" });

            string fullNameToReturn;
            if (string.IsNullOrWhiteSpace(userRecord.FullName))
            {
                // DB 無值：用 Email @ 前段當預設，並嘗試寫回（寫回時處理中文編碼）
                var defaultName = (userRecord.Email ?? "").Split('@').FirstOrDefault() ?? "未設定";
                fullNameToReturn = defaultName;

                try
                {
                    var userEntity = await _userManager.FindByIdAsync(userId);
                    if (userEntity != null && string.IsNullOrWhiteSpace(userEntity.FullName))
                    {
                        userEntity.FullName = EncodeFullNameIfNeeded(defaultName);
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
                fullNameToReturn = DecodeFullNameIfNeeded(userRecord.FullName);
            }

            // 判斷備援信箱狀態
            var backupEmailFilled = !string.IsNullOrWhiteSpace(userRecord.BackupEmail);
            var backupVerified = userRecord.BackupEmailConfirmed == true; // 若為 1 (或 true) 表示已驗證

            return Ok(new
            {
                success = true,
                email = userRecord.Email,
                backupEmail = userRecord.BackupEmail,
                backupEmailFilled,
                backupVerified,
                avatar = userRecord.Avatar,
                fullName = fullNameToReturn
            });
        }
        // 新增：處理 FullName 編碼/解碼（目前實作為直接回傳，可按需求改為編碼）
        private static string EncodeFullNameIfNeeded(string? fullName)
        {
            // 若未來需要處理特殊字元或 URL encode，可在此實作；目前直接回傳原始字串
            return fullName ?? string.Empty;
        }

        private static string DecodeFullNameIfNeeded(string? fullName)
        {
            // 若資料庫以某種編碼儲存，於此處解碼；目前直接回傳原始字串
            return fullName ?? string.Empty;
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
                    // .FromSqlRaw("SELECT * FROM LeaveDates WHERE UserId = {0} AND LeaveDate1 IS NOT NULL AND LeaveDate1 IN ({1})", userId, string.Join(',', added))
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
            // 嘗試解析常見的 JSON 陣列格式或直接是 URL 的情況，回傳第一張可用的 URL（否則回傳 null）
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

            backupEmail = backupEmail.Trim();

            var emailAttr = new System.ComponentModel.DataAnnotations.EmailAddressAttribute();
            if (!emailAttr.IsValid(backupEmail))
                return BadRequest(new { message = "請提供有效的備援信箱" });

            // 不允許備援信箱與使用者主要註冊信箱相同（若使用者已登入）
            var currentUserEmail = User?.Identity?.IsAuthenticated == true
                ? User.FindFirstValue(ClaimTypes.Email)
                : null;
            if (!string.IsNullOrEmpty(currentUserEmail) &&
                string.Equals(currentUserEmail.Trim(), backupEmail, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { message = "備援信箱不可與主要註冊信箱相同。" });
            }

            // 若為會員中心發起，帶入 userId 到 token（MemberCenter 可顯示「等待驗證中」）
            int? currentUserId = null;
            if (User?.Identity?.IsAuthenticated == true)
            {
                var idClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (int.TryParse(idClaim, out var parsed)) currentUserId = parsed;
            }

            var payload = new Dictionary<string, object?>
            {
                ["email"] = backupEmail,
                ["createdAt"] = DateTime.UtcNow,
                ["expiresAt"] = DateTime.UtcNow.AddHours(24)
            };
            if (currentUserId.HasValue) payload["userId"] = currentUserId.Value;

            var json = JsonSerializer.Serialize(payload);
            var protectedPayload = _dataProtector.Protect(json);
            var tokenForUrl = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(protectedPayload));

            var callbackUrl = Url.Action("ConfirmBackupLookup", "AuthApi",
                new { t = tokenForUrl }, Request.Scheme);

            try
            {
                var dummyUser = new ApplicationUser { UserName = backupEmail, Email = backupEmail };
                await _emailSender.SendConfirmationLinkAsync(dummyUser, backupEmail, callbackUrl!);

                // 若會員中心發起，寫入短期 cookie 用於 MemberCenter 顯示「等待驗證中」
                if (currentUserId.HasValue)
                {
                    var cookieOptions = new CookieOptions
                    {
                        HttpOnly = true,
                        Secure = true,            // 本機若用 https 則為 true，部署時務必啟用 HTTPS
                        SameSite = SameSiteMode.None,       // 允許第三方追蹤轉跳後仍會帶回 cookie
                        Path = "/",
                        Expires = DateTimeOffset.UtcNow.AddMinutes(30)
                    };
                    Response.Cookies.Append("BackupLookupPending", tokenForUrl, cookieOptions);
                }

                _logger?.LogInformation("SendBackupLookup: sent verification to {Email}", backupEmail);
                return Ok(new { message = "已寄出驗證信，請至備援信箱點擊連結以驗證。" });
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "SendBackupLookup: failed sending to {Email}", backupEmail);
                return StatusCode(500, new { message = "寄信失敗，請稍後再試。" });
            }
        }
        // 完整替換 ConfirmBackupLookup 方法，加入對 SendGrid / 追蹤鏈結可能改寫的容錯解碼，並寫入 SameSite=None cookie
        [HttpGet("ConfirmBackupLookup")]
        public async Task<IActionResult> ConfirmBackupLookup(string t)
        {
            if (string.IsNullOrEmpty(t))
            {
                return BadRequest("無效的驗證連結。");
            }

            try
            {
                // 嘗試多種解碼方式以容錯第三方追蹤/重新導向可能造成的編碼改變
                string protectedPayload = string.Empty;
                bool unprotected = false;
                Exception? lastEx = null;

                // 1) 常見情況：t 為 Base64Url( protectedPayload )
                try
                {
                    var decoded = WebEncoders.Base64UrlDecode(t);
                    protectedPayload = Encoding.UTF8.GetString(decoded);
                    unprotected = true;
                }
                catch (Exception ex1)
                {
                    lastEx = ex1;
                    // 2) 嘗試先反 URL encode（SendGrid 可能雙重或改寫）
                    try
                    {
                        var unescaped = Uri.UnescapeDataString(t);
                        var decoded2 = WebEncoders.Base64UrlDecode(unescaped);
                        protectedPayload = Encoding.UTF8.GetString(decoded2);
                        unprotected = true;
                    }
                    catch (Exception ex2)
                    {
                        lastEx = ex2;
                        // 3) 最後嘗試直接把 t 當作已受保護字串（若寄送時沒有再 base64）
                        try
                        {
                            protectedPayload = t;
                            unprotected = true;
                        }
                        catch (Exception ex3)
                        {
                            lastEx = ex3;
                        }
                    }
                }

                if (!unprotected)
                {
                    _logger?.LogWarning(lastEx, "ConfirmBackupLookup: failed to decode token");
                    return BadRequest("驗證連結無效或已被改寫，請重新發送驗證信。");
                }

                // 反保護
                string json;
                try
                {
                    json = _dataProtector.Unprotect(protectedPayload);
                }
                catch (Exception ex)
                {
                    _logger?.LogWarning(ex, "ConfirmBackupLookup: Unprotect failed");
                    return BadRequest("驗證連結已過期或無效。");
                }

                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (!root.TryGetProperty("email", out var emailProp) ||
                    !root.TryGetProperty("expiresAt", out var expiresProp))
                {
                    return BadRequest("驗證連結無效或已被使用。");
                }

                var email = emailProp.GetString();
                var expiresAt = expiresProp.GetDateTime();

                if (expiresAt < DateTime.UtcNow)
                {
                    return BadRequest("驗證連結已過期或無效。");
                }

                // 若包含 userId（會員中心流程），直接更新使用者資料
                if (root.TryGetProperty("userId", out var userIdProp) && userIdProp.TryGetInt32(out var uid))
                {
                    var user = await _userManager.FindByIdAsync(uid.ToString());
                    if (user == null) return BadRequest("找不到對應使用者，無法完成備援信箱驗證。");

                    if (!string.IsNullOrEmpty(user.Email) &&
                        string.Equals(user.Email.Trim(), email?.Trim(), StringComparison.OrdinalIgnoreCase))
                    {
                        return BadRequest("備援信箱不可與主要註冊信箱相同。");
                    }

                    user.BackupEmail = email;
                    user.BackupEmailConfirmed = true;

                    var updateResult = await _userManager.UpdateAsync(user);
                    if (!updateResult.Succeeded)
                    {
                        _logger?.LogWarning("ConfirmBackupLookup: failed updating backup email for user {UserId}: {Errors}",
                            uid, string.Join(", ", updateResult.Errors.Select(e => e.Description)));
                        return StatusCode(500, "儲存備援信箱失敗，請稍後再試。");
                    }

                    Response.Cookies.Delete("BackupLookupPending");

                    return Redirect("/Auth/MemberCenter?backupVerified=1");
                }

                // 非會員中心流程：把原始 token (t) 存成 cookie 供前端檢查
                var cookieOptions = new CookieOptions
                {
                    HttpOnly = true,
                    Secure = true,
                    SameSite = SameSiteMode.None,
                    Path = "/",
                    Expires = DateTimeOffset.UtcNow.AddMinutes(30)
                };
                Response.Cookies.Append("BackupLookupPending", t, cookieOptions);

                return RedirectToAction("CheckEmail", "Auth", new { backupVerified = 1 });
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "ConfirmBackupLookup: invalid token");
                return BadRequest("驗證連結已過期或無效。");
            }
        }

        // 新增 helper（放在類別內合適位置）
        private static string MaskEmailLocal(string? email)
        {
            if (string.IsNullOrEmpty(email)) return string.Empty;
            var idx = email.IndexOf('@');
            if (idx <= 0) return email;
            var local = email.Substring(0, idx);
            var domain = email.Substring(idx); // 包含 '@'
            if (local.Length <= 4) return local + domain;
            return local.Substring(0, 4) + new string('*', local.Length - 4) + domain;
        }

        // Replace GetBackupLookupResult 方法
        [HttpGet("GetBackupLookupResult")]
        public async Task<IActionResult> GetBackupLookupResult()
        {
            if (!Request.Cookies.TryGetValue("BackupLookupPending", out var cookie) || string.IsNullOrEmpty(cookie))
            {
                return Ok(new { found = false });
            }

            try
            {
                string protectedPayload;
                try
                {
                    var decoded = WebEncoders.Base64UrlDecode(cookie);
                    protectedPayload = Encoding.UTF8.GetString(decoded);
                }
                catch (Exception decodeEx)
                {
                    _logger?.LogWarning(decodeEx, "GetBackupLookupResult: Base64Url decode failed for cookie.");
                    Response.Cookies.Delete("BackupLookupPending");
                    return Ok(new { found = false });
                }

                string json;
                try
                {
                    json = _dataProtector.Unprotect(protectedPayload);
                }
                catch (Exception unprotectEx)
                {
                    _logger?.LogWarning(unprotectEx, "GetBackupLookupResult: Unprotect failed for payload.");
                    Response.Cookies.Delete("BackupLookupPending");
                    return Ok(new { found = false });
                }

                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                // 取得 email 與 expiresAt（容錯）
                string? email = null;
                if (root.TryGetProperty("email", out var emailProp) && emailProp.ValueKind == JsonValueKind.String)
                {
                    email = emailProp.GetString();
                }

                DateTime expiresAtUtc = DateTime.MinValue;
                bool hasValidExpiry = false;
                if (root.TryGetProperty("expiresAt", out var expiresProp))
                {
                    try
                    {
                        if (expiresProp.ValueKind == JsonValueKind.String)
                        {
                            var s = expiresProp.GetString();
                            if (!string.IsNullOrEmpty(s) &&
                                DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
                            {
                                expiresAtUtc = parsed.ToUniversalTime();
                                hasValidExpiry = true;
                            }
                        }
                        else if (expiresProp.ValueKind == JsonValueKind.Number)
                        {
                            try
                            {
                                expiresAtUtc = expiresProp.GetDateTime().ToUniversalTime();
                                hasValidExpiry = true;
                            }
                            catch { }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger?.LogWarning(ex, "GetBackupLookupResult: expiresAt parsing failed.");
                    }
                }

                if (string.IsNullOrEmpty(email) || !hasValidExpiry || expiresAtUtc < DateTime.UtcNow)
                {
                    Response.Cookies.Delete("BackupLookupPending");
                    return Ok(new { found = false });
                }

                var lower = email.ToLowerInvariant();

                // 查詢所有使用相同備援信箱的帳號
                var usersByBackup = await _userManager.Users
                    .Where(u => u.BackupEmail != null && u.BackupEmail.ToLower() == lower)
                    .Select(u => new
                    {
                        Email = u.Email,
                        EmailConfirmed = u.EmailConfirmed,
                        UserId = u.Id
                    })
                    .ToListAsync();

                if (usersByBackup.Count > 1)
                {
                    // 多個主帳號：回傳 accounts 陣列供前端選擇
                    var accounts = usersByBackup.Select(u => new
                    {
                        email = u.Email,
                        masked = MaskEmailLocal(u.Email),
                        emailConfirmed = u.EmailConfirmed,
                        userId = u.UserId
                    }).ToArray();

                    return Ok(new
                    {
                        found = true,
                        lookupEmail = email,
                        lookupEmailMasked = MaskEmailLocal(email),
                        accounts
                    });
                }

                if (usersByBackup.Count == 1)
                {
                    var u = usersByBackup[0];
                    return Ok(new
                    {
                        found = true,
                        lookupEmail = email,
                        lookupEmailMasked = MaskEmailLocal(email),
                        accountEmail = u.Email,
                        accountEmailMasked = MaskEmailLocal(u.Email),
                        primaryEmailConfirmed = u.EmailConfirmed,
                        note = u.EmailConfirmed ? "已找到主信箱。" : "找到主信箱，但主信箱尚未完成驗證。"
                    });
                }

                // 檢查是否為已驗證的主信箱
                var userByPrimaryConfirmed = await _userManager.Users
                    .FirstOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == lower && u.EmailConfirmed);

                if (userByPrimaryConfirmed != null)
                {
                    return Ok(new
                    {
                        found = true,
                        lookupEmail = email,
                        lookupEmailMasked = MaskEmailLocal(email),
                        accountEmail = userByPrimaryConfirmed.Email,
                        accountEmailMasked = MaskEmailLocal(userByPrimaryConfirmed.Email),
                        primaryEmailConfirmed = true,
                        note = "此信箱為已驗證的主信箱。"
                    });
                }

                Response.Cookies.Delete("BackupLookupPending");
                return Ok(new { found = false, message = "此信箱未綁定任何已註冊且驗證過的帳號。" });
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "GetBackupLookupResult: unexpected error while parsing backup lookup cookie.");
                Response.Cookies.Delete("BackupLookupPending");
                return Ok(new { found = false });
            }
        }
    }
}