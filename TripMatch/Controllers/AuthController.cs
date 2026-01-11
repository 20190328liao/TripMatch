using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.DotNet.Scaffolding.Shared.Messaging;
using Microsoft.EntityFrameworkCore;
using System.Net.NetworkInformation;
using System.Security.Claims;
using System.Text;
using TripMatch.Models;
using TripMatch.Models.Settings;
using TripMatch.Services;
using static TripMatch.Services.AuthServicesExtensions;
using TripMatch.Data;

namespace TripMatch.Controllers
{
    [Route("[controller]/[action]")]
    public class AuthController : Controller
    {
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly AuthService _authService;
        private readonly IEmailSender<ApplicationUser> _emailSender;
        private readonly TravelDbContext _dbContext;

        public AuthController(
            SignInManager<ApplicationUser> signInManager,
            UserManager<ApplicationUser> userManager,
            AuthService authService,
            IEmailSender<ApplicationUser> emailSender,
            TravelDbContext dbContext
            )
            => (_signInManager, _userManager, _authService, _emailSender, _dbContext) = (signInManager, userManager, authService, emailSender, dbContext);


        #region Views (頁面)

        [HttpGet]
        public IActionResult Login()
        {
            if (User?.Identity?.IsAuthenticated == true)
            {
                return RedirectToAction("Index", "Home");
            }
            return View();
        }

        [HttpGet]
        public IActionResult Signup()
        {
            return View();
        }

        [HttpGet]
        public IActionResult CheckEmail()
        {
            return View();
        }

        [HttpGet]
        public IActionResult ForgotPassword()
        {
            return View("ForgotPassword");
        }

        [HttpGet]
        public IActionResult ForgotEmail()
        {
            return View();
        }

        [HttpGet]
        [Authorize]  // ★ 自動驗證，未登入會導向預設登入頁
        public IActionResult MemberCenter()
        {
            return View();
        }

        [HttpGet]
        [Authorize]
        public IActionResult ChangePassword()
        {
            return View();
        }

        




        // 新增於 AuthController 類別內（放在其他 action 同區塊）
        [HttpGet]
        [Authorize]
        public async Task<IActionResult> InitiatePasswordReset()
        {
            // 取得目前使用者 Id（Claims）
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                // 若找不到使用者，導回會員中心或忘記密碼頁
                return RedirectToAction("MemberCenter");
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return RedirectToAction("MemberCenter");
            }

            // 產生原始 Token
            var code = await _userManager.GeneratePasswordResetTokenAsync(user);

            // Base64Url 編碼（與其它流程一致）
            code = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));

            // 導向 ForgotPassword，帶上參數 userId & code
            return RedirectToAction("ForgotPassword", new { userId = user.Id, code = code });
        }

        [HttpGet]
        public async Task<IActionResult> ConfirmEmail(string userId, string code)
        {
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(code))
            {
                if (Request.Headers["X-Requested-With"] == "XMLHttpRequest" || Request.Headers["Accept"].ToString().Contains("application/json"))
                    return BadRequest(new { success = false, message = "無效的驗證連結。" });

                ViewData["Status"] = "Error";
                ViewData["Message"] = "無效的驗證連結。";
                return View("CheckEmail");
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                if (Request.Headers["X-Requested-With"] == "XMLHttpRequest" || Request.Headers["Accept"].ToString().Contains("application/json"))
                    return BadRequest(new { success = false, message = "用戶不存在。" });

                ViewData["Status"] = "Error";
                ViewData["Message"] = "用戶不存在。";
                return View("CheckEmail");
            }

            var decodedCode = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code));
            var result = await _userManager.ConfirmEmailAsync(user, decodedCode);

            if (result.Succeeded)
            {
                // 寫入站域 cookie，以便前端檢查 (注意 SameSite 與 Secure 設定需與 AuthService.SetPendingCookie 一致)
                _authService.SetPendingCookie(HttpContext, user.Email);

                if (Request.Headers["X-Requested-With"] == "XMLHttpRequest" || Request.Headers["Accept"].ToString().Contains("application/json"))
                {
                    return Ok(new { success = true, message = "Email 驗證成功！" });
                }

                // 瀏覽器直接點連結 -> 導回 Signup（正常跳轉）
                return RedirectToAction("Signup");
            }
            else
            {
                var err = string.Join(", ", result.Errors.Select(e => e.Description));
                if (Request.Headers["X-Requested-With"] == "XMLHttpRequest" || Request.Headers["Accept"].ToString().Contains("application/json"))
                    return BadRequest(new { success = false, message = "Email 驗證失敗：" + err });

                ViewData["Status"] = "Error";
                ViewData["Message"] = "Email 驗證失敗：" + err;
                return View("CheckEmail");
            }
        }
        [HttpGet]
        public async Task<IActionResult> VerifyPasswordResetLink(string userId, string code)
        {
            if (userId == null || code == null)
            {
                return RedirectToAction("ForgotPassword", new { error = "invalid_link" });
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return RedirectToAction("ForgotPassword", new { error = "user_not_found_reset" });
            }

            try
            {
                // 進行 Base64Url 解碼
                var decodedCode = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code));

                // 驗證 token 有效性（但不立即重設密碼）
                var isValidToken = await _userManager.VerifyUserTokenAsync(user,
                    _userManager.Options.Tokens.PasswordResetTokenProvider,
                    "ResetPassword",
                    decodedCode);

                if (!isValidToken)
                {
                    return RedirectToAction("ForgotPassword", new { error = "invalid_code" });
                }

                // Token 有效：把重設資訊存入 Session（24 小時內有效）
                HttpContext.Session.SetString("PasswordResetUserId", userId);
                HttpContext.Session.SetString("PasswordResetCode", code);
                HttpContext.Session.SetString("PasswordResetTime", DateTime.UtcNow.ToString("O"));

                // 導回 ForgotPassword 頁面（前端會以 CheckPasswordResetSession 判斷）
                return RedirectToAction("ForgotPassword");
            }
            catch
            {
                return RedirectToAction("ForgotPassword", new { error = "invalid_code" });
            }
        }

        #endregion

        #region API (邏輯)

        // Google 登入跳轉
        [HttpGet]
            public IActionResult LoginGoogle()
            {
                var properties = _signInManager.ConfigureExternalAuthenticationProperties("Google", Url.Action("GoogleResponse", "Auth"));
                return Challenge(properties, "Google");
            }

            // Google 登入回調
            [HttpGet]
            public async Task<IActionResult> GoogleResponse()
            {
                var info = await _signInManager.GetExternalLoginInfoAsync();
                if (info == null)
                {
                    return RedirectToAction("Login");
                }

                // ★ 從 Google Claims 取得頭像 URL
                var googleAvatar = info.Principal.FindFirstValue("picture");

                // 1. 嘗試用外部登入資訊登入
                var result = await _signInManager.ExternalLoginSignInAsync(info.LoginProvider, info.ProviderKey, isPersistent: false, bypassTwoFactor: true);

                if (result.Succeeded)
                {
                    var user = await _userManager.FindByLoginAsync(info.LoginProvider, info.ProviderKey);
                    if (user != null)
                    {
                        // ★ 更新頭像（如果 Google 有提供且使用者尚未設定自訂頭像）
                        if (!string.IsNullOrEmpty(googleAvatar) && string.IsNullOrEmpty(user.Avatar))
                        {
                            user.Avatar = googleAvatar;
                            await _userManager.UpdateAsync(user);
                        }

                        var token = _authService.GenerateJwtToken(user);
                        _authService.SetAuthCookie(HttpContext, token);
                        return RedirectToAction("Index", "Home");
                    }
                }

                // 2. 如果沒帳號，自動註冊
                var email = info.Principal.FindFirstValue(ClaimTypes.Email);
                if (string.IsNullOrEmpty(email)) return BadRequest("無法從 Google 取得 Email");

                var userByEmail = await _userManager.FindByEmailAsync(email);
                if (userByEmail == null)
                {
                    // 建立新帳號時直接設定頭像
                    userByEmail = new ApplicationUser
                    {
                        UserName = email,
                        Email = email,
                        EmailConfirmed = true,
                        Avatar = googleAvatar,  // 設定 Google 頭像
                        FullName = info.Principal.FindFirstValue(ClaimTypes.Name)  // ★ 可選：設定名稱
                    };
                    var createResult = await _userManager.CreateAsync(userByEmail);
                    if (!createResult.Succeeded) return BadRequest("自動註冊失敗");
                }
                else if (string.IsNullOrEmpty(userByEmail.Avatar) && !string.IsNullOrEmpty(googleAvatar))
                {
                    // 已有帳號但沒頭像，更新頭像
                    userByEmail.Avatar = googleAvatar;
                    await _userManager.UpdateAsync(userByEmail);
                }

                // 連結 Google 帳號
                await _userManager.AddLoginAsync(userByEmail, info);
                await _signInManager.SignInAsync(userByEmail, isPersistent: false);

                var newToken = _authService.GenerateJwtToken(userByEmail);
                _authService.SetAuthCookie(HttpContext, newToken);

                return RedirectToAction("Index", "Home");
            }

        #endregion
    }
}