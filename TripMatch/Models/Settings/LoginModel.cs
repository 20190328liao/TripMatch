using System.ComponentModel.DataAnnotations;

namespace TripMatch.Models.Settings
{
    //登入時跟後端比對的用途,不用存放資料庫,要加上驗證標籤
    public class LoginModel
    {
        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;
        [Required]
        [DataType(DataType.Password)]
        public string Password { get; set; } = string.Empty;
    }
}
