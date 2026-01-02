namespace TripMatch.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using TripMatch.Models;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser, IdentityRole<int>, int>
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        // 1. 必須先呼叫 base，載入 Identity 預設配置
        base.OnModelCreating(builder);

        // 2. 強制將 Identity 所有系統表的欄位從 "Id" 改名為 "UserId"
        // 這樣可以確保整個資料庫的一致性
        builder.Entity<ApplicationUser>(b =>
        {
            b.Property(u => u.Id).HasColumnName("UserId");
        });

        builder.Entity<IdentityUserRole<int>>(b => b.Property(r => r.UserId).HasColumnName("UserId"));
        builder.Entity<IdentityUserClaim<int>>(b => b.Property(c => c.UserId).HasColumnName("UserId"));
        builder.Entity<IdentityUserLogin<int>>(b => b.Property(l => l.UserId).HasColumnName("UserId"));
        builder.Entity<IdentityUserToken<int>>(b => b.Property(t => t.UserId).HasColumnName("UserId"));

        // 3. 批量綁定所有自定義業務表 (Trips, Flights 等)
        foreach (var entityType in builder.Model.GetEntityTypes())
        {
            // 僅處理您定義在 TripMatch.Models 命名空間下的表
            if (entityType.ClrType.Namespace != null && entityType.ClrType.Namespace.Contains("TripMatch.Models"))
            {
                var userIdProp = entityType.FindProperty("UserId");

                // 如果該表有 UserId 屬性，且不是 User 本身，就建立 FK 關聯
                if (userIdProp != null && entityType.ClrType != typeof(ApplicationUser))
                {
                    builder.Entity(entityType.ClrType)
                        .HasOne(typeof(ApplicationUser), "User") // 指向 ApplicationUser 的導覽屬性
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict); // 避免級聯刪除衝突
                }
            }
        }
    }
}