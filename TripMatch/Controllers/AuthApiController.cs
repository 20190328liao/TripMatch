using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using TripMatch.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace TripMatch.Controllers
{

    [Route("api/auth/")]
    [ApiController]
    public class AuthApiController : Controller
    {
//        [HttpGet]
//        public IActionResult Login()
//        {
//            // 如果已經登入，直接導回首頁
//            if (User?.Identity != null && User.Identity.IsAuthenticated)
//            {
//                return RedirectToAction("Index", "Home");
//            }

//            return View("Login");
//        }

//        [HttpGet]
//        public IActionResult Signup()
//        {
//            return View("Signup");
//        }

//        [HttpGet]
//        public IActionResult CheckEmail()
//        {
//            return View("CheckEmail");
//        }

//        [HttpPost]
//[Route("api/auth/login")] 
//public async Task<IActionResult> Login([FromBody] InputModel data) 
//{
//            if(data == null) return BadRequest(new { 
//                success = false, 
//                message = "請輸入帳號密碼。"
//            });
//            //var result = await _signInManager.PasswordSignInAsync(data.Email, data.Password, isPersistent: true, lockoutOnFailure: false);

//            // 登入成功後，回傳成功訊息與跳轉路徑
//            return Ok(new { 
//        success = true, 
//        message = "歡迎回來！", 
//        redirectUrl = Url.Action("Index", "Home") 
//    });
//}

//[HttpPost]
//[Route("api/auth/register")]
//public async Task<IActionResult> Register([FromBody] InputModel data)
//{
//    // ... 註冊邏輯 ...

//    return Ok(new { 
//        success = true, 
//        message = "註冊成功！請登入驗證。", 
//        redirectUrl = Url.Action("Login", "AuthApi") // 指向您的 Login 檢視
//    });
//}





    }
}
