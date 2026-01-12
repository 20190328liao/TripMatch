using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using TripMatch.Extensions;
using TripMatch.Models;
using TripMatch.Services;
using TripMatch.Services.ExternalClients;


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
            builder.Services.AddScoped<TimeWindowService>();

            // 註冊身分驗證基礎設施
            builder.Services.AddIdentityInfrastructure(builder.Configuration);

            // 註冊各個模組的services
            builder.Services.AddScoped<MatchServices>();
            builder.Services.AddScoped<TripServices>();
            builder.Services.AddScoped<SpotServices>();
            builder.Services.AddScoped<BillingServices>();

            // 註冊 Typed HttpClient (會自動處理 HttpClient 的生命週期)
            builder.Services.AddHttpClient<GooglePlacesClient>();
            builder.Services.AddScoped<PlacesImageService>();

            // 取得UserId服務註冊（必須在 Build 之前）
            builder.Services.AddScoped<ITagUserId, TagUserIdAccessor>();


            // 註冊身分驗證基礎設施



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
                options.LoginPath = "/Auth/Login";
                options.AccessDeniedPath = "/Auth/Login";

                options.Events.OnRedirectToLogin = ctx =>
                {
                    if (ctx.Request.Path.StartsWithSegments("/api"))
                    {
                        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        return Task.CompletedTask;
                    }
                    ctx.Response.Redirect(ctx.RedirectUri);
                    return Task.CompletedTask;
                };

                options.Events.OnRedirectToAccessDenied = ctx =>
                {
                    if (ctx.Request.Path.StartsWithSegments("/api"))
                    {
                        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                        return Task.CompletedTask;
                    }
                    ctx.Response.Redirect(ctx.RedirectUri);
                    return Task.CompletedTask;
                };
            });

            // 持久化 Data Protection Key（防止重啟後 Token 失效）
            builder.Services.AddDataProtection()
                .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Environment.ContentRootPath, "Keys")))
                .SetApplicationName("TripMatch");

            // 註冊旅遊資訊服務(目前是假資料)
            // todo:串外部api要回來改實作類別
            builder.Services.AddScoped<ITravelInfoService, MockTravelInfoService>();

            // --- 建立應用程式 ---
            var app = builder.Build();

            // --- 測試代碼開始 ---
            var connString = app.Configuration.GetConnectionString("DefaultConnection");
            Console.WriteLine($"==== 目前使用的資料庫連線是：{connString} ====");
            // --- 測試代碼結束 ---

        
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
            app.UseTagUserId();  // 假設你有 extension 方法註冊 Middleware

            app.MapControllerRoute(
                name: "default",
                pattern: "{controller=Home}/{action=Index}/{id?}");

            app.Run();

        }
    }
}
