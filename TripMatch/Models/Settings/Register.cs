using System.ComponentModel.DataAnnotations;

namespace TripMatch.Models.Settings
{
    public class Register
    {
        [Required(ErrorMessage = "Email 為必填")]
        [EmailAddress(ErrorMessage = "Email 格式不正確")]
        public string Email { get; set; } = string.Empty;

        [Required(ErrorMessage = "密碼為必填")]
        [StringLength(18, MinimumLength = 6, ErrorMessage = "密碼需為 6-18 碼")]
        [RegularExpression(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$", ErrorMessage = "密碼需包含大小寫英文與數字")]
        public string Password { get; set; } = string.Empty;

        [Compare("Password", ErrorMessage = "兩次密碼輸入不一致")]
        public string ConfirmPassword { get; set; } = string.Empty;
    }
}
