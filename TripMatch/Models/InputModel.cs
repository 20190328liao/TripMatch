public class InputModel
{
    public string? Email { get; set; }
    public string? Password { get; set; }
    public string? confirmPassword { get; set; }
    public bool RememberMe { get; set; } // 新增這一行
}