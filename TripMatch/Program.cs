using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using TripMatch.Extensions;
using TripMatch.Models;
using TripMatch.Services;
using TripMatch.Services.Common;
using TripMatch.Services.ExternalClients;
using System.Security.Claims;

namespace TripMatch
{
    public class Program
    {
        public static void Main(string[] args)
        {
            //一個服務只負責一種責任


            var builder = WebApplication.CreateBuilder(args);
            builder.Services.AddAntiforgery(options =>
            {
                // 這行非常重要，必須與你 JS 裡的 headers 名稱完全一致
                options.HeaderName = "RequestVerificationToken";
            });

            // Add services to the container.
            builder.Services.AddControllersWithViews();
            var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
            builder.Services.AddDbContext<TravelDbContext>(x => x.UseSqlServer(connectionString));
            builder.Services.AddScoped<TimeWindowService>();

            // 註冊基礎服務
            builder.Services.AddScoped<SharedService>();

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
            //通知服務
            //builder.Services.AddSingleton<TripMatch.Services.InMemoryNotificationStore>();
            //builder.Services.AddHostedService<TripMatch.Services.EmailVerificationReminderService>();

            // 取得UserId服務註冊（必須在 Build 之前）
            builder.Services.AddScoped<ITagUserId, TagUserIdAccessor>();
            builder.Services.AddRazorPages();

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
                options.Cookie.SameSite = SameSiteMode.None;
                options.Cookie.SecurePolicy = CookieSecurePolicy.Always;

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
            app.MapRazorPages();
            app.UseRouting();

            // 在建立管線時，於 app.UseRouting() 與 app.UseAuthentication() 之間加入一個中介層
            // 以移除已過期或明顯無效的 AuthToken，避免驗證中間件在請求內使用殘留 cookie
            // Insert this BEFORE app.UseAuthentication();

            app.Use(async (context, next) =>
            {
                if (context.Request.Cookies != null && context.Request.Cookies.TryGetValue("AuthToken", out var token) && !string.IsNullOrWhiteSpace(token))
                {
                    try
                    {
                        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
                        var jwt = handler.ReadJwtToken(token);
                        // 如果 token 已過期或 exp 無法解析，刪除 cookie 防止短暫顯示其他使用者資料
                        if (jwt.ValidTo <= DateTime.UtcNow)
                        {
                            try { context.Response.Cookies.Delete("AuthToken"); } catch { /* ignore */ }
                        }
                    }
                    catch
                    {
                        // 非法 token -> 刪除 cookie
                        try { context.Response.Cookies.Delete("AuthToken"); } catch { /* ignore */ }
                    }
                }

                await next();
            });

            app.UseSession(); // 此行必須在 UseRouting() 之後

            app.UseAuthentication();
            app.UseAuthorization();
            app.UseTagUserId();  // 假設你有 extension 方法註冊 Middleware

            app.MapControllerRoute(
                name: "default",
                pattern: "{controller=Home}/{action=Index}/{id?}");

            // --- 在 request pipeline 加一個簡單 middleware，將 Claim 的 UserId 寫入 accessor
            app.Use(async (context, next) =>
            {
                var accessor = context.RequestServices.GetRequiredService<ITagUserId>();
                var idClaim = context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (int.TryParse(idClaim, out var id))
                {
                    accessor.Set(id);
                }
                await next();
            });

            app.Run();

        }
    }
}