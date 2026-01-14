using System.ComponentModel.DataAnnotations;

namespace TripMatch.Models.Settings
{
    public class InputModel
    {
        [Required]
        [EmailAddress]
        [Display(Name = "Email")]
        public string? Email { get; set; }
        [Required]
        [StringLength(18, ErrorMessage = "{0} 長度必須在 {2} 到 {1} 個字元之間。", MinimumLength = 6)]
        [DataType(DataType.Password)]
        [Display(Name = "Password")]
        public string? Password { get; set; }
        [DataType(DataType.Password)]
        [Display(Name = "confirmPassword")]
        [Compare("Password", ErrorMessage = "密碼和確認密碼不符。")]
        public string? confirmPassword { get; set; }
    }

    public class ResetPasswordModel
    {
        public string? UserId { get; set; } = string.Empty;
        public string? Code { get; set; } = string.Empty;
        public string? Password { get; set; } = string.Empty;
    }
    public class LoginModel
    {
        [Required]
        [EmailAddress]
        [Display(Name = "Email")]
        public string? Email { get; set; }
        [Required]
        [StringLength(18, ErrorMessage = "{0} 長度必須在 {2} 到 {1} 個字元之間。", MinimumLength = 6)]
        [DataType(DataType.Password)]
        [Display(Name = "Password")]
        public string? Password { get; set; }
    }
    // 新增此模型
    public class ValidatePasswordResetLinkModel
    {
        public string? UserId { get; set; } = string.Empty;
        public string? Code { get; set; } = string.Empty;
    }
    public class ValidateEmailConfirmationLinkModel
    {
        public string? UserId { get; set; } = string.Empty;
        public string? Code { get; set; } = string.Empty;
    }

    public class SetPasswordResetSessionModel
    {
        public string UserId { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
    }

    public class ChangePasswordModel
    {
        [Required(ErrorMessage = "請輸入舊密碼")]
        [DataType(DataType.Password)]
        public string? OldPassword { get; set; }

        [Required(ErrorMessage = "請輸入新密碼")]
        [StringLength(18, MinimumLength = 6, ErrorMessage = "{0} 長度必須在 {2} 到 {1} 個字元之間。")]
        [DataType(DataType.Password)]
        public string? NewPassword { get; set; }

        [Required(ErrorMessage = "請再次輸入新密碼")]
        [DataType(DataType.Password)]
        [Compare("NewPassword", ErrorMessage = "新密碼和確認密碼不符。")]
        public string? ConfirmPassword { get; set; }
    }

}
