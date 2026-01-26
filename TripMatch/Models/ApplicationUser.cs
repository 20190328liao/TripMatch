namespace TripMatch.Models;

using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Security.Claims;

public class ApplicationUser : IdentityUser<int>
{
    [Column(TypeName = "nvarchar(256)")] 
    public string? FullName { get; set; } 
    public string? BackupEmail { get; set; }
    public string? Avatar { get; set; }
    public bool BackupEmailConfirmed { get; set; }
    public DateTime CreatedAt { get; set; }

    public ApplicationUser()
    {
        CreatedAt = GetTaipeiNow();
    }

    private static DateTime GetTaipeiNow()
    {
        // 支援 Linux/Windows 不同的時區 ID
        var candidates = new[] { "Asia/Taipei", "Taipei Standard Time" };
        foreach (var id in candidates)
        {
            try
            {
                var tz = TimeZoneInfo.FindSystemTimeZoneById(id);
                return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
            }
            catch
            {
                // 忽略找不到的例外，嘗試下一個 id
            }
        }

        // 若系統無法解析時區，fallback 為 UTC+8
        return DateTime.UtcNow.AddHours(8);
    }
}

public class AppUserClaims : UserClaimsPrincipalFactory<ApplicationUser, IdentityRole<int>>
{
    public AppUserClaims(UserManager<ApplicationUser> um, RoleManager<IdentityRole<int>> rm, IOptions<IdentityOptions> opt)
        : base(um, rm, opt) { }

    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(ApplicationUser user)
    {
        var idClaims = await base.GenerateClaimsAsync(user);
        idClaims.AddClaim(new Claim("Avatar", user.Avatar ?? "/img/default_avatar.png"));
        // ★ 只有當 FullName 有值時才寫入 GivenName Claim
        if (!string.IsNullOrEmpty(user.FullName))
        {
            idClaims.AddClaim(new Claim(ClaimTypes.GivenName, user.FullName));
        }
        return idClaims;
    }
}