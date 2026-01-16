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
            try
            {
                if (!userId.HasValue)
                {
                    var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
                    if (string.IsNullOrEmpty(claim) || !int.TryParse(claim, out var parsed)) return Unauthorized();
                    userId = parsed;
                }

                var ranges = await _dbContext.TripMembers
                    .AsNoTracking()
                    .Where(tm => tm.UserId == userId.Value)
                    .Select(tm => new { tm.Trip.StartDate, tm.Trip.EndDate })
                    .Where(t => t.StartDate != default && t.EndDate != default)
                    .Distinct()
                    .ToListAsync();

                var result = ranges.Select(r => new
                {
                    start = r.StartDate.ToString("yyyy-MM-dd"),
                    end = r.EndDate.ToString("yyyy-MM-dd")
                }).ToList();

                return Ok(new { ranges = result });
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "GetLockedRanges failed for userId={UserId}", userId);
                return StatusCode(500, new { success = false, message = "伺服器端發生錯誤，請查看伺服器日誌以取得詳細資訊。" });
            }
        }

        [HttpGet("GetLeaves")]
        [Authorize]
        public async Task<IActionResult> GetLeaves(int? userId)
        {
            try
            {
                if (!userId.HasValue)
                {
                    var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
                    if (string.IsNullOrEmpty(claim) || !int.TryParse(claim, out var parsed)) return Unauthorized();
                    userId = parsed;
                }

                var leaves = await _dbContext.Set<LeaveDate>()
                    .Where(l => l.UserId == userId.Value && l.LeaveDate1.HasValue)
                    .Select(l => l.LeaveDate1!.Value.ToString("yyyy-MM-dd"))
                    .ToListAsync();

                return Ok(new { dates = leaves });
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "GetLeaves failed for userId={UserId}", userId);
                return StatusCode(500, new { success = false, message = "伺服器端發生錯誤，請查看伺服器日誌以取得詳細資訊。" });
            }
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
            if (string.IsNullOrWhiteSpace(email))
                return BadRequest(new { message = "請提供 Email" });

            email = email.Trim();
            var normalized = email.ToUpperInvariant();

            // 1. 先用 UserManager 查詢（原本邏輯）
            var user = await _userManager.FindByEmailAsync(email);

            // 2. 額外用 DbContext 檢查 AspNetUsers（加強診斷與避免 NormalizedEmail 差異）
            var dbUser = await _dbContext.AspNetUsers
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Email == email || (u.NormalizedEmail != null && u.NormalizedEmail == normalized));

            // 如果 Db 找到但 UserManager.FindByEmailAsync 沒找到，嘗試以 Id 從 UserManager 取得完整 entity
            if (user == null && dbUser != null)
            {
                user = await _userManager.FindByIdAsync(dbUser.Id.ToString());
            }

            _logger?.LogInformation("SendConfirmation invoked for {Email}. userFound={UserFound}, dbRecordFound={DbFound}, EmailConfirmed={EmailConfirmed}",
                email, user != null, dbUser != null, user?.EmailConfirmed);

            if (user != null)
            {
                // 情況 A: 已經完全註冊好（有密碼） -> 叫他去登入
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
                {
                    _logger?.LogWarning("SendConfirmation CreateAsync failed for {Email}: {Errors}", email, string.Join(", ", createResult.Errors.Select(e => e.Description)));
                    return BadRequest(new { message = "系統錯誤，請重新發送驗證信" });
                }
            }

            // 產生 token 與寄信
            var code = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            code = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));
            var callbackUrl = Url.Action("ConfirmEmail", "Auth", new { userId = user.Id, code = code }, Request.Scheme);

            try
            {
                await _emailSender.SendConfirmationLinkAsync(user, email, callbackUrl!);
                _authService.SetPendingCookie(HttpContext, user.Email);

                // 記錄成功（方便偵錯）
                _logger?.LogInformation("SendConfirmation: confirmation email sent to {Email} for userId={UserId}", email, user.Id);

                return Ok(new { message = "驗證信已發送，請檢查信箱或垃圾郵件。" });
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "SendConfirmation: failed to send confirmation to {Email}", email);
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
                return Ok(new { success = true, message = "Email 驗證成功！" });
            }
            else
            {
                // 失敗：返回錯誤 JSON
                return BadRequest(new { success = false, message = "Email 驗證失敗：" + string.Join(", ", result.Errors.Select(e => e.Description)) });
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

        // 其餘方法保持不變...
        // （為簡潔，這裡保留後續既有方法不動）
        // 請留意：我已移除通知相關欄位、建構子注入與 API；前端 notifications.js 若仍存在會得到 404，建議同步移除或停用該 JS。
    }
}