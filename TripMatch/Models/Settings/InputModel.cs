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

    
}
