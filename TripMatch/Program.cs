using Microsoft.EntityFrameworkCore;
using TripMatch.Models;
using TripMatch.Services;


namespace TripMatch
{
    public class Program
    {
        public static void Main(string[] args)
        {
            //一個服務只負責一種責任


            var builder = WebApplication.CreateBuilder(args);


            // Add services to the container.
            builder.Services.AddControllersWithViews();
            var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
            builder.Services.AddDbContext<TravelDbContext>(x => x.UseSqlServer(connectionString));


            // 註冊身分驗證基礎設施

            builder.Services.AddIdentityInfrastructure(builder.Configuration);
            
          
            // Swagger 與 授權
            builder.Services.AddAuthorization();
            builder.Services.AddEndpointsApiExplorer();

            // 配置 Session 服務
            builder.Services.AddSession(options =>
            {
                options.IdleTimeout = TimeSpan.FromHours(24); // Session 有效期為 24 小時
                options.Cookie.HttpOnly = true; // 防止 JavaScript 存取
                options.Cookie.IsEssential = true; // 即使未同意 Cookie 也要設定
                options.Cookie.SameSite = SameSiteMode.Lax;
            });
           
            builder.Services.ConfigureApplicationCookie(options =>
            {
                options.LoginPath = "/AuthApi/Login";
                options.AccessDeniedPath = "/AuthApi/Login";
            });

            // --- 建立應用程式 ---
            var app = builder.Build();
            // --- 3. 中間件配置 ---
            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }
            else
            {
                app.UseExceptionHandler("/Home/Error");
            }
            app.UseHttpsRedirection();
            app.UseDefaultFiles(); // 支援 wwwroot/signup.html 等靜態檔案

            app.UseStaticFiles();

            app.UseRouting();
            app.UseSession(); // 此行必須在 UseRouting() 之後

            app.UseAuthentication();
            app.UseAuthorization();
            app.MapControllerRoute(
                name: "default",
                pattern: "{controller=Home}/{action=Index}/{id?}");

            app.Run();
        }
    }
}
