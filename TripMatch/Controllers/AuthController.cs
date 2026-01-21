using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.DotNet.Scaffolding.Shared.Messaging;
using Microsoft.EntityFrameworkCore;
using System.Net.NetworkInformation;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using TripMatch.Data;
using TripMatch.Models;
using TripMatch.Models.Settings;
using TripMatch.Services;
using static TripMatch.Services.AuthServicesExtensions;

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
        private readonly ITagUserId _tagUserId;

        public AuthController(
            SignInManager<ApplicationUser> signInManager,
            UserManager<ApplicationUser> userManager,
            AuthService authService,
            IEmailSender<ApplicationUser> emailSender,
            TravelDbContext dbContext, ITagUserId tagUserId
            )
            => (_signInManager, _userManager, _authService, _emailSender, _dbContext,_tagUserId) = (signInManager, userManager, authService, emailSender, dbContext,tagUserId);


        #region Views (頁面)


        [HttpGet]
        public IActionResult ReplacePasswords()
        {
            return View();
        }

        // Login (GET)
        [HttpGet]
        [RedirectIfAuthenticated]
        public IActionResult Login(string? returnUrl = null)
        {
            ViewData["ReturnUrl"] = returnUrl;
            return View();
        }

        // Login (POST)
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Login(InputModel model, string? returnUrl = null)
        {
            ViewData["ReturnUrl"] = returnUrl;

            if (!ModelState.IsValid)
            {
                return View(model);
            }
            // 檢查 Email 與 Password 不為 null
            if (string.IsNullOrWhiteSpace(model.Email) || string.IsNullOrWhiteSpace(model.Password))
            {
                ModelState.AddModelError(string.Empty, "請輸入帳號與密碼。");
                return View(model);
            }
            // 不使用 RememberMe，固定為 false
            var result = await _signInManager.PasswordSignInAsync(model.Email, model.Password, isPersistent: false, lockoutOnFailure: false);
            if (result.Succeeded)
            {
                if (!string.IsNullOrEmpty(returnUrl) && Url.IsLocalUrl(returnUrl))
                {
                    return LocalRedirect(returnUrl);
                }
                return RedirectToAction("Index", "Match");
            }

            ModelState.AddModelError(string.Empty, "登入失敗，請檢查帳號或密碼。");
            return View(model);
        }

        [HttpGet]
        [RedirectIfAuthenticated]
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
        [RedirectIfAuthenticated]
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
        [Authorize]
        public IActionResult MemberCenter()
        {
            // 傳入空集合避免 Razor 在 Model轉換失敗時拋出 NullReferenceException
            return View(System.Linq.Enumerable.Empty<TripMatch.Models.Settings.WishlistCard>());
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
                ViewData["Message"] = "用戶不存在或已被移除，請重新發送驗證信。";
                return View("CheckEmail");
            }

            try
            {
                var decodedCode = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code));
                var result = await _userManager.ConfirmEmailAsync(user, decodedCode);

                if (result.Succeeded)
                {
                    // 重新從資料庫讀取並再次確認 state（防止有人在 DB 直接移除或異動造成不一致）
                    var refreshed = await _userManager.FindByIdAsync(userId);
                    if (refreshed == null || !await _userManager.IsEmailConfirmedAsync(refreshed))
                    {
                        // 若重新檢查失敗，視為驗證未完成或資料遺失
                        if (Request.Headers["X-Requested-With"] == "XMLHttpRequest" || Request.Headers["Accept"].ToString().Contains("application/json"))
                        {
                            return BadRequest(new { success = false, message = "驗證未完成或資料已變更，請重新發送驗證信。" });
                        }

                        ViewData["Status"] = "Error";
                        ViewData["Message"] = "驗證未完成或資料已變更，請重新發送驗證信。";
                        return View("CheckEmail");
                    }

                    // 寫入站域 cookie，供前端 polling/register 流程使用
                    _authService.SetPendingCookie(HttpContext, refreshed.Email);

                    if (Request.Headers["X-Requested-With"] == "XMLHttpRequest" || Request.Headers["Accept"].ToString().Contains("application/json"))
                    {
                        return Ok(new { success = true, message = "Email 驗證成功！" });
                    }

                    ViewData["Status"] = "Success";
                    ViewData["Message"] = "Email 驗證成功，請回到註冊頁完成帳號設定。";
                    return View("CheckEmail");
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
            catch
            {
                if (Request.Headers["X-Requested-With"] == "XMLHttpRequest" || Request.Headers["Accept"].ToString().Contains("application/json"))
                    return BadRequest(new { success = false, message = "驗證碼無效" });

                ViewData["Status"] = "Error";
                ViewData["Message"] = "驗證碼無效或已過期。";
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
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ChangePassword(ChangePasswordModel model)
        {
            if (model == null) return BadRequest(new { success = false, message = "無效的請求資料。" });
            if (string.IsNullOrWhiteSpace(model.OldPassword) ||
                string.IsNullOrWhiteSpace(model.NewPassword) ||
                string.IsNullOrWhiteSpace(model.ConfirmPassword))
            {
                return BadRequest(new { success = false, message = "所有欄位都是必填的。" });
            }
            if (model.NewPassword != model.ConfirmPassword)
            {
                return BadRequest(new { success = false, message = "新密碼與確認密碼不符。" });
            }

            // 格式驗證同前端
            var pwdCheck = ValidatePasswordRules(model.NewPassword);
            if (!pwdCheck.IsValid)
            {
                return BadRequest(new { success = false, message = "密碼格式不符：" + pwdCheck.Message, missingRules = pwdCheck.MissingRules });
            }

            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { success = false, message = "找不到使用者。" });
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return NotFound(new { success = false, message = "找不到使用者。" });

            // 第三方登入回傳提示
            if (!await _userManager.HasPasswordAsync(user))
            {
                return Conflict(new { action = "external", message = "請前往 google 重設密碼流程。" });
            }

            var changeResult = await _userManager.ChangePasswordAsync(user, model.OldPassword!, model.NewPassword!);
            if (!changeResult.Succeeded)
            {
                var errors = changeResult.Errors.Select(e => e.Description).ToArray();
                return BadRequest(new { success = false, message = errors.FirstOrDefault() ?? "密碼修改失敗。", errors });
            }

            // 安全性：更新登入狀態與 Cookie
            await _signInManager.RefreshSignInAsync(user);
            var newToken = _authService.GenerateJwtToken(user);
            _authService.SetAuthCookie(HttpContext, newToken);

            HttpContext.Session.Remove("PasswordResetUserId");
            HttpContext.Session.Remove("PasswordResetCode");
            HttpContext.Session.Remove("PasswordResetTime");
            Response.Cookies.Delete("PendingEmail");

            // 根據請求判斷回應：AJAX 要 JSON；直接表單提交則導向會員中心
            var acceptsJson = Request.Headers["X-Requested-With"] == "XMLHttpRequest" ||
                              Request.Headers["Accept"].ToString().Contains("application/json");
            if (acceptsJson)
            {
                return Ok(new { success = true, message = "密碼已更新。" });
            }

            // 非 AJAX：導回會員中心（可用 TempData 顯示通知）
            TempData["Message"] = "密碼已更新。";
            return RedirectToAction("MemberCenter");
        }



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

        public class RedirectIfAuthenticatedAttribute : ActionFilterAttribute
        {
            public override void OnActionExecuting(ActionExecutingContext context)
            {
                if (context.HttpContext.User.Identity.IsAuthenticated)
                {
                    // 已登入就導回首頁
                    context.Result = new RedirectToActionResult("Index", "Home", null);
                }
                base.OnActionExecuting(context);
            }
        }
        #endregion


    }
}