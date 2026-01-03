using System.ComponentModel.DataAnnotations;

namespace TripMatch.Models.Settings
{
    //登入時跟後端比對的用途,不用存放資料庫,要加上驗證標籤
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
}
