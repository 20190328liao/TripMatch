using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using System.Security.Claims;
using System.Text;
using TripMatch.Models;
using TripMatch.Models.Settings;
using TripMatch.Services; 
using static TripMatch.Services.AuthServicesExtensions;

namespace TripMatch.Controllers
{
    [Route("[controller]/[action]")]
    public class AuthApiController : Controller
    {
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly AuthService _authService;
        private readonly IEmailSender<ApplicationUser> _emailSender;

        public AuthApiController(
            SignInManager<ApplicationUser> signInManager,
            UserManager<ApplicationUser> userManager,
            AuthService authService,
            IEmailSender<ApplicationUser> emailSender)
        {
            _signInManager = signInManager;
            _userManager = userManager;
            _authService = authService;
            _emailSender = emailSender;
        }

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

        #endregion

        #region API (邏輯)

        // 登入 API
        [HttpPost]
        public async Task<IActionResult> Login([FromBody] LoginModel data)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(new { success = false, message = "輸入資料格式錯誤" });
            }

            var user = await _userManager.FindByEmailAsync(data.Email!);
            if (user == null)
            {
                return Unauthorized(new { success = false, message = "帳號或密碼錯誤" });
            }

            var result = await _signInManager.PasswordSignInAsync(user, data.Password!, isPersistent: false, lockoutOnFailure: true);

            if (result.Succeeded)
            {               
                var token = _authService.GenerateJwtToken(user);
                _authService.SetAuthCookie(HttpContext, token);
                _authService.SetPendingCookie(HttpContext, user.Email);

                return Ok(new
                {
                    success = true,
                    message = "登入成功",
                    redirectUrl = Url.Action("Index", "Home")
                });
            }

            if (result.IsLockedOut)
            {
                return StatusCode(423, new { success = false, message = "帳號已被鎖定，請稍後再試。" });
            }

            var accessFailedCount = await _userManager.GetAccessFailedCountAsync(user);
            var remainingAttempts = 5 - accessFailedCount;

            return BadRequest(new { success = false, message = $"帳號或密碼錯誤。剩餘嘗試次數：{remainingAttempts}" });
        }

        // 寄送驗證信 API
        [HttpPost]
        public async Task<IActionResult> SendConfirmation([FromBody] string email)
        {
            var user = await _userManager.FindByEmailAsync(email);
            if (user != null)
            {
                // 情況 A: 已經完全註冊好（有密碼） -> 叫他去登入
                // 修正：只要 PasswordHash 有值，就代表已設定過密碼 (因為下方修正為建立時不給密碼)
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

            // 情況 C: 完全沒有帳號的新使用者
            if (user == null)
            {
                user = new ApplicationUser { UserName = email, Email = email };
                // 修正：建立時不給預設密碼，這樣 PasswordHash 會是 null
                var createResult = await _userManager.CreateAsync(user);
                if (!createResult.Succeeded) return BadRequest(new { message = "系統錯誤，請重新發送驗證信" });
            }

            // 1. 產生原始 Token
            var code = await _userManager.GenerateEmailConfirmationTokenAsync(user);
            
            // 2. ★ 進行 Base64Url 編碼
            code = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));

            // 3. 生成連結指向 ConfirmEmail Action
            var callbackUrl = Url.Action("ConfirmEmail", "AuthApi", new { userId = user.Id, code = code }, Request.Scheme);

            await _emailSender.SendConfirmationLinkAsync(user, email, callbackUrl!);

            _authService.SetPendingCookie(HttpContext, user.Email);

            return Ok(new { message = "驗證信已發送，請檢查信箱或垃圾郵件。" });
        }

        // 註冊 (設定密碼) API
        // 對應 signup.js: /AuthApi/Register
        [HttpPost]
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
            var result = await _userManager.ResetPasswordAsync(user, resetToken, model.Password);
            
            if (result.Succeeded)
            {
                Response.Cookies.Delete("PendingEmail");
                return Ok(new 
                { 
                    success = true,
                    message = "帳戶設定成功！請登入",
                    redirectUrl = Url.Action("Login", "AuthApi")
                });
            }

            var errorMsg = result.Errors.FirstOrDefault()?.Description ?? "註冊失敗";
            return BadRequest(new { message = errorMsg, errors = result.Errors });
        }

        // ★ 修改：驗證信箱 (加入 WebEncoders 解碼 & 回傳 View)
        [HttpGet]
        public async Task<IActionResult> ConfirmEmail(string userId, string code)
        {
            if (userId == null || code == null)
            {
                // 參數不足，顯示失敗畫面
                ViewData["Status"] = "Error";
                ViewData["Message"] = "無效的驗證連結。";
                return View("CheckEmail"); 
            }

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                ViewData["Status"] = "Error";
                ViewData["Message"] = "找不到此使用者。";
                return View("CheckEmail");
            }

            try
            {
                // 1. ★ 進行 Base64Url 解碼
                var decodedCode = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code));
                
                // 2. 驗證
                var result = await _userManager.ConfirmEmailAsync(user, decodedCode);

                if (result.Succeeded)
                {
                    _authService.SetPendingCookie(HttpContext, user.Email);
                    
                    // 成功：設定 ViewData 讓 View 顯示成功畫面
                    ViewData["Status"] = "Success";
                    return View("CheckEmail");
                }
            }
            catch
            {
                // 解碼失敗或其他錯誤
            }

            // 失敗
            ViewData["Status"] = "Error";
            ViewData["Message"] = "驗證失敗或連結已過期。";
            return View("CheckEmail");
        }

        // 檢查 DB 狀態 (前端 Polling 用)
        [HttpGet]
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

        //檢查 Email 狀態 (手動輸入 Email 用)
        [HttpPost]
        public async Task<IActionResult> CheckEmailStatus([FromBody] string email)
        {
            var user = await _userManager.FindByEmailAsync(email);
            if (user != null && user.EmailConfirmed)
            {
                return Ok(new { verified = true });
            }

            return Ok(new { verified = false });
        }
        // 登出 API
        [HttpPost]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            Response.Cookies.Delete("AuthToken");
            return RedirectToAction("Index", "Home");
        }

        // Google 登入跳轉
        [HttpGet]
        public IActionResult LoginGoogle()
        {
            var properties = _signInManager.ConfigureExternalAuthenticationProperties("Google", Url.Action("GoogleResponse", "AuthApi"));
            return Challenge(properties, "Google");
        }

        // Google 登入回調
        [HttpGet]
        public async Task<IActionResult> GoogleResponse()
        {
            var info = await _signInManager.GetExternalLoginInfoAsync();
            if (info == null)
            {
                return RedirectToAction("Login"); // 或顯示錯誤
            }

            // 1. 嘗試用外部登入資訊登入
            var result = await _signInManager.ExternalLoginSignInAsync(info.LoginProvider, info.ProviderKey, isPersistent: false, bypassTwoFactor: true);

            if (result.Succeeded)
            {
                // 登入成功，發 JWT
                var user = await _userManager.FindByLoginAsync(info.LoginProvider, info.ProviderKey);
                if (user != null)
                {
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
                userByEmail = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true };
                var createResult = await _userManager.CreateAsync(userByEmail);
                if (!createResult.Succeeded) return BadRequest("自動註冊失敗");
            }

            // 連結 Google 帳號
            await _userManager.AddLoginAsync(userByEmail, info);
            await _signInManager.SignInAsync(userByEmail, isPersistent: false);

            var newToken = _authService.GenerateJwtToken(userByEmail);
            _authService.SetAuthCookie(HttpContext, newToken);

            return RedirectToAction("Index", "Home"); 
        }

        // 測試用產生假會員 API
        [HttpPost]
        public async Task<IActionResult> TestGenerateUser()
        {
            var randomId = Guid.NewGuid().ToString().Substring(0, 5);
            var fakeUser = new ApplicationUser
            {
                UserName = $"Tester_{randomId}",
                Email = $"test_{randomId}@example.com",
                EmailConfirmed = true
            };

            // 使用 UserManager 建立使用者 (密碼需符合您的 Identity 規則)
            var createResult = await _userManager.CreateAsync(fakeUser, "Test1234!");

            if (!createResult.Succeeded)
            {
                var errorMsg = string.Join(", ", createResult.Errors.Select(e => e.Description));
                return BadRequest(new { message = errorMsg });
            }

            // 4. 為了產生 Token，我們需要 User 物件 (其實 fakeUser 已經有了，但為了保險可重查)
            var user = await _userManager.FindByIdAsync(fakeUser.Id.ToString());
            if (user == null) return NotFound();

            // 5. 產生 JWT 並寫入 Cookie
            var token = _authService.GenerateJwtToken(user);
            _authService.SetAuthCookie(HttpContext, token);

            // 6. 回傳給前端
            return Ok(new
            {
                message = "成功新增假會員並自動登入",
                userId = user.Id,
                userName = user.UserName
            });
        }

        // 1. 發送重設密碼信件
        [HttpPost]
        public async Task<IActionResult> SendPasswordReset([FromBody] string email)
        {
            var user = await _userManager.FindByEmailAsync(email);

            // 為了安全，即使找不到使用者也不要報錯
            if (user == null || !await _userManager.IsEmailConfirmedAsync(user))
            {
                // 這裡回傳成功訊息，避免被枚舉帳號
                return Ok(new { message = "若帳號存在且已驗證，我們將發送重設信件。" });
            }

            // 產生原始 Token
            var code = await _userManager.GeneratePasswordResetTokenAsync(user);

            // ★ 進行 Base64Url 編碼 (避免 URL 特殊字元問題)
            code = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));

            // 產生重設連結，指向前端頁面 (帶有 userId 和 code 參數)
            // 這裡假設您的 ForgotPassword 頁面路徑是 /AuthApi/ForgotPassword
            // 這樣使用者點擊連結後，會回到該頁面，JS 會讀取 URL 參數並顯示重設密碼表單
            var callbackUrl = Url.Action("ForgotPassword", "AuthApi",
                new { userId = user.Id, code = code }, Request.Scheme);

            await _emailSender.SendPasswordResetLinkAsync(user, email, callbackUrl!);

            return Ok(new { message = "重設密碼信件已發送，請檢查信箱。" });
        }

        // 2. 執行重設密碼
        // 對應 forgotPassword.js 的 AJAX 呼叫
        [HttpPost]
        public async Task<IActionResult> PerformPasswordReset([FromBody] ResetPasswordModel model)
        {
            if (string.IsNullOrEmpty(model.UserId) || string.IsNullOrEmpty(model.Code) || string.IsNullOrEmpty(model.Password))
            {
                return BadRequest(new { message = "無效的請求資料。" });
            }

            var user = await _userManager.FindByIdAsync(model.UserId);
            if (user == null)
            {
                // 為了安全，通常回傳模糊的錯誤，但這裡為了除錯先回傳明確訊息
                return BadRequest(new { message = "使用者不存在。" });
            }

            try
            {
                // ★ 進行 Base64Url 解碼
                var decodedCode = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(model.Code));

                var result = await _userManager.ResetPasswordAsync(user, decodedCode, model.Password);

                if (result.Succeeded)
                {
                    return Ok(new { message = "密碼重設成功！" });
                }

                var errorMsg = result.Errors.FirstOrDefault()?.Description ?? "重設失敗";
                return BadRequest(new { message = errorMsg, errors = result.Errors });
            }
            catch
            {
                return BadRequest(new { message = "無效的驗證碼。" });
            }
        }

        // 定義接收參數的模型 (可以放在 Models 資料夾或檔案下方)
     
        #endregion
    }
}