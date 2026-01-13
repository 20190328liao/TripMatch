namespace TripMatch.Models;

using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

public class ApplicationUser : IdentityUser<int>
{
    public string? FullName { get; set; }
    public string? BackupEmail { get; set; }
    public string? Avatar { get; set; }
    public bool BackupEmailConfirmed { get; set; }
    public DateTime CreatedAt { get; set; }

}

public class AppUserClaims : UserClaimsPrincipalFactory<ApplicationUser, IdentityRole<int>>
{
    public AppUserClaims(UserManager<ApplicationUser> um, RoleManager<IdentityRole<int>> rm, IOptions<IdentityOptions> opt)
        : base(um, rm, opt) { }

    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(ApplicationUser user)
    {
        var idClaims = await base.GenerateClaimsAsync(user);
        // 塞入頭像路徑，如果 null 就給預設圖
        idClaims.AddClaim(new Claim("Avatar", user.Avatar ?? "/images/default_avatar.png"));
        return idClaims;
    }
}