using TripMatch.Models;
using Microsoft.AspNetCore.Identity;

public class TestingService
{
    private readonly UserManager<ApplicationUser> _userManager;

    public TestingService(UserManager<ApplicationUser> userManager)
    {
        _userManager = userManager;
    }

    public async Task<(bool Succeeded, int UserId, string UserName, string? Error)> CreateFakeUserAsync()
    {
        var randomId = Guid.NewGuid().ToString().Substring(0, 5);
        var fakeUser = new ApplicationUser
        {
            UserName = $"Tester_{randomId}",
            Email = $"test_{randomId}@example.com",
            EmailConfirmed = true
        };

        // 使用您在 Identity 要求的密碼規則
        var identityResult = await _userManager.CreateAsync(fakeUser, "Test1234!");

        if ( identityResult.Succeeded)
        {
            // 因為您已經將 IdentityUser<int> 擴充，這裡的 user.Id 就是 int
            return (true, fakeUser.Id, fakeUser.UserName!, null);
        }

        var errorMsg = string.Join(", ",  identityResult.Errors.Select(e => e.Description));
        return (false, 0, "", errorMsg);
    }
}