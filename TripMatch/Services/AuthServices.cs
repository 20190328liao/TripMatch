using TripMatch.Models.Settings;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SendGrid;
using SendGrid.Helpers.Mail;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using TripMatch.Data;
using TripMatch.Models;
using Microsoft.AspNetCore.WebUtilities; 
using static TripMatch.Services.AuthServicesExtensions.AuthService;

namespace TripMatch.Services
{
    public static class AuthServicesExtensions
    {
        public static IServiceCollection AddIdentityServices(this IServiceCollection services, IConfiguration config)
        {
            // 1. 搬移 JwtSettings 綁定
            // Authentication 讀取 Cookie 中的 JWT
            var jwtSettings = new JwtSettings();
            config.GetSection("Jwt").Bind(jwtSettings);
            services.Configure<JwtSettings>(config.GetSection("Jwt"));

            // 2. 搬移 AddAuthentication & AddJwtBearer
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwtSettings.Issuer,
                    ValidAudience = jwtSettings.Audience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Key))
                };

                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        context.Token = context.Request.Cookies["AuthToken"];
                        return Task.CompletedTask;
                    }
                };
            })
            .AddGoogle(googleOptions =>
            {
                // 從 Configuration 讀取 secrets.json 的設定
                googleOptions.ClientId = config["Authentication:Google:ClientId"] ?? string.Empty;
                googleOptions.ClientSecret = config["Authentication:Google:ClientSecret"] ?? string.Empty;


                googleOptions.CallbackPath = "/signin-google";
            });
            // 3. 搬移 Configure<IdentityOptions>
            services.Configure<IdentityOptions>(options =>
            {
                options.SignIn.RequireConfirmedAccount = true; //要求驗證的電子郵件

                // Password settings.
                options.Password.RequireDigit = false;
                options.Password.RequireLowercase = true;
                options.Password.RequireNonAlphanumeric = false;
                options.Password.RequireUppercase = true;
                options.Password.RequiredLength = 6;
                options.Password.RequiredUniqueChars = 1;

                // Lockout settings.
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.AllowedForNewUsers = true;

                // User settings.
                options.User.AllowedUserNameCharacters =
                    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._@+";
                options.User.RequireUniqueEmail = false;
            });

            // 4. 註冊 AuthService
            services.AddScoped<AuthService>();

            return services;
        }

        public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
        {
            var group = app.MapGroup("/api/auth");

            //新使用者：
            //建帳號 -> 寄信 -> 點連結領 Cookie -> 填密碼。
            //Cookie 掉了的老客戶：
            //輸入 Email -> 系統發現沒密碼 -> 重新寄信 -> 點連結「補領」Cookie -> 回原頁填密碼。

            //測試用：自動產生假會員並登入
            group.MapPost("/test-generate-user", async (TestingService testingService, AuthService authService, HttpContext context, UserManager<ApplicationUser> userManager) =>
            {
                // 1. 呼叫服務直接取得 userId
                var (succeeded, userId, userName, error) = await testingService.CreateFakeUserAsync();

                if (!succeeded) return Results.BadRequest(new { message = error });

                // 2. 為了產生 Token，我們還是需要 User 物件
                var user = await userManager.FindByIdAsync(userId.ToString());
                if (user == null) return Results.NotFound();

                // 3. 產生 JWT 並寫入 Cookie
                var token = authService.GenerateJwtToken(user);
                authService.SetAuthCookie(context, token);

                // 4. 回傳給前端 (組員 B 測試時可以看到目前是哪位 ID)
                return Results.Ok(new
                {
                    message = "成功新增假會員並自動登入",
                    userId = userId, // 這就是您要的 userID (int)
                    userName = userName
                });
            });

            // 註冊
            group.MapPost("/register", async ([FromBody] Register model, UserManager<ApplicationUser> userManager, HttpContext context) =>
            {
                // 1. 修改：取出 Cookie 值並進行比對
                if (!context.Request.Cookies.TryGetValue("PendingEmail", out var pendingEmail))
                {
                    return Results.BadRequest(new { message = "驗證逾時，請重新驗證 Email" });
                }

                // 2. ★關鍵修正：檢查 Cookie 內的 Email 是否與目前提交的 Email 一致
                // 防止使用者驗證了 A 信箱，卻拿來註冊 B 信箱
                if (!string.Equals(pendingEmail, model.Email, StringComparison.OrdinalIgnoreCase))
                {
                    return Results.BadRequest(new { message = "驗證資訊不符，請重新驗證 Email" });
                }

                var user = await userManager.FindByEmailAsync(model.Email);
                if (user == null || !user.EmailConfirmed)
                {
                    return Results.BadRequest(new { message = "請先完成Email驗證" });
                }

                // 防止重複註冊
                var hasPassword = await userManager.HasPasswordAsync(user);
                if (hasPassword)
                {
                    return Results.Conflict(new { message = "該帳號已完成設定，請直接登入" });
                }

                // 正式設定密碼
                var resetToken = await userManager.GeneratePasswordResetTokenAsync(user);
                var result = await userManager.ResetPasswordAsync(user, resetToken, model.Password);
                if (result.Succeeded)
                {
                    // 註冊成功後，刪除暫存的 PendingEmail Cookie
                    context.Response.Cookies.Delete("PendingEmail");
                    return Results.Ok(new { message = "帳戶設定成功！請登入" });
                }

                return Results.BadRequest(new { errors = result.Errors });
            });

            // 引導使用者去 Google 登入頁面
            group.MapGet("/login-google", (HttpContext context) =>
            {
                var properties = new AuthenticationProperties
                {
                    RedirectUri = "/api/auth/google-response" // Google 回來
                };
                return Results.Challenge(properties, ["Google"]);
            });

            // Google 登入完畢
            group.MapGet("/google-response", async (HttpContext context, AuthService authService, UserManager<ApplicationUser> userManager) =>
            {
                var result = await context.AuthenticateAsync("ExternalCookie");
                if (!result.Succeeded) return Results.BadRequest("Google 驗證失敗");

                var email = result.Principal.FindFirstValue(ClaimTypes.Email);
                if (string.IsNullOrEmpty(email)) return Results.BadRequest("無法從 Google 取得 Email");

                // 檢查資料庫是否有此人
                var user = await userManager.FindByEmailAsync(email);
                if (user == null)
                {
                    // 如果沒帳號，直接幫他建立一個
                    user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true };
                    await userManager.CreateAsync(user);
                }

                // 產生你專案內用的 JWT
                var token = authService.GenerateJwtToken(user);
                authService.SetAuthCookie(context, token);

                // 登入成功後跳轉回前端首頁
                return Results.Redirect("/index.html");
            });


            // 發送驗證信
            group.MapPost("/send-confirmation", async ([FromBody] string email, UserManager<ApplicationUser> userManager, IEmailSender<ApplicationUser> emailSender, AuthService authService, HttpContext context) =>
            {
                var request = context.Request;

                var user = await userManager.FindByEmailAsync(email);
                if (user != null)
                {
                    // 修正邏輯：
                    // 只有當使用者「有密碼」且「已驗證信箱」時，才視為已完成註冊，阻擋並要求登入。
                    // 如果使用者有密碼但沒驗證 (EmailConfirmed = false)，應該允許他重發驗證信 (否則會卡死)。
                    bool hasPassword = !string.IsNullOrEmpty(user.PasswordHash);

                    if (hasPassword && user.EmailConfirmed)
                    {
                        return Results.Conflict(new { action = "redirect_login", message = "Email 已註冊，請直接登入。" });
                    }

                    // 情況 B: 已驗證信箱但還沒設密碼 (例如 Google 登入使用者想補設密碼)
                    // 注意：如果有密碼但沒驗證，不會進這裡 (EmailConfirmed is false)，會往下走去寄信
                    if (user.EmailConfirmed && !hasPassword)
                    {
                        authService.SetPendingCookie(context, user.Email); 
                        return Results.Ok(new { verified = true, message = "此帳號已驗證成功，請直接設定密碼。" });
                    }
                }

                // 情況C:完全沒有帳號的新使用者 (或有帳號但未驗證且需要重發信)
                if (user == null)
                {
                    user = new ApplicationUser { UserName = email, Email = email };
                    // 修正：建立時不給預設密碼
                    var createResult = await userManager.CreateAsync(user);
                    if (!createResult.Succeeded) return Results.BadRequest("系統錯誤，請重新發送驗證信");
                }

                // 產生驗證 Token
                var code = await userManager.GenerateEmailConfirmationTokenAsync(user);

                // 這裡會呼叫我們修正後的 GenerateConfirmUrl
                var callbackUrl = authService.GenerateConfirmUrl(context, user.Id, code);
                await emailSender.SendConfirmationLinkAsync(user, email, callbackUrl);
                authService.SetPendingCookie(context, user.Email);

                return Results.Ok(new { message = "驗證信已發送，請檢查信箱或垃圾郵件。" });
            });

            // 登出
            group.MapPost("/logout", async (SignInManager<ApplicationUser> signInManager, HttpContext context) =>
            {
                await signInManager.SignOutAsync();
                context.Response.Cookies.Delete("AuthToken");
                return Results.Ok(new { message = "已登出" });
            }).RequireAuthorization();

            group.MapGet("/check-db-status", async (HttpContext context, UserManager<ApplicationUser> userManager) =>
            {
                // 後端直接從 Cookie 拿 Email，前端無法偽造
                if (!context.Request.Cookies.TryGetValue("PendingEmail", out var email))
                {
                    return Results.Ok(new { verified = false });
                }

                var user = await userManager.FindByEmailAsync(email);

                if (user != null && user.EmailConfirmed)
                {
                    return Results.Ok(new { verified = true, email });
                }

                return Results.Ok(new { verified = false });
            });

            group.MapPost("/check-email-status", async ([FromBody] string email, UserManager<ApplicationUser> userManager) =>
            {
                var user = await userManager.FindByEmailAsync(email);
                if (user != null && user.EmailConfirmed)
                {
                    return Results.Ok(new { verified = true });
                }

                return Results.Ok(new { verified = false });
            });

            group.MapGet("/confirm-email", async ([FromQuery] string userId, [FromQuery] string code, UserManager<ApplicationUser> userManager, AuthService authService, HttpContext context) =>
            {
                var user = await userManager.FindByIdAsync(userId);
                if (user == null) return Results.Redirect("/checkemail.html?status=error");

                var result = await userManager.ConfirmEmailAsync(user, code);

                // 驗證成功,或是已經驗證過但需要重新給Cookie
                if (result.Succeeded || user.EmailConfirmed)
                {
                    // ★ 補發或寫入 PendingEmail Cookie
                    authService.SetPendingCookie(context, user.Email);

                    // 驗證成功
                    return Results.Redirect("/checkemail.html?status=success");
                }

                return Results.Redirect("/checkemail.html?status=error");
            });
        }

        public static int GetUserId(this ClaimsPrincipal user)
        {
            // 優先找 JWT，再找 NameIdentifier
            var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                             ?? user.FindFirst("sub")?.Value;

            if (string.IsNullOrEmpty(userIdClaim))
            {
                return 0;
            }

            return int.Parse(userIdClaim);
        }


        public static IServiceCollection AddIdentityInfrastructure(this IServiceCollection services, IConfiguration configuration)
        {
            services.Configure<SendGridSettings>(configuration.GetSection("checkemail"));

            // Add services to the container.
            var connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

            // 擴充方法
            services.AddIdentityServices(configuration);

            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseSqlServer(connectionString));

            services.AddIdentityApiEndpoints<ApplicationUser>() // 這行會幫你註冊 UserManager
                .AddEntityFrameworkStores<ApplicationDbContext>();

            services.AddTransient<IEmailSender<ApplicationUser>, EmailSender>();

            services.ConfigureApplicationCookie(options =>
            {
                options.ExpireTimeSpan = TimeSpan.FromDays(14);
                options.SlidingExpiration = true;
            });

            services.AddControllers();
            services.AddEndpointsApiExplorer();
            services.AddSwaggerGen(options =>
            {
                // 1. 定義 Bearer 方案
                options.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
                {
                    Name = "Authorization",
                    Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
                    Scheme = "Bearer",
                    BearerFormat = "JWT",
                    In = Microsoft.OpenApi.Models.ParameterLocation.Header,
                    Description = "請輸入 JWT Token。格式為: Bearer {你的Token}"
                });

                var securityRequirement = new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
                {
                    {
                        new Microsoft.OpenApi.Models.OpenApiSecurityScheme
                        {
                            Reference = new Microsoft.OpenApi.Models.OpenApiReference
                            {
                                Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                                Id = "Bearer"
                            }
                        },
                        Array.Empty<string>()
                    }
                };

                options.AddSecurityRequirement(securityRequirement);
            });

            return services;
        }

        public sealed class AuthService
        {
            private readonly UserManager<ApplicationUser> _userManager;
            private readonly IOptions<JwtSettings> _jwtSettings;

            public AuthService(UserManager<ApplicationUser> userManager, IOptions<JwtSettings> jwtSettings)
            {
                _userManager = userManager;
                _jwtSettings = jwtSettings;
            }

            public string GenerateJwtToken(ApplicationUser user)
            {

                ArgumentNullException.ThrowIfNull(user);

                var settings = _jwtSettings.Value ?? throw new InvalidOperationException("JwtSettings 尚未設定 (IOptions<JwtSettings>.Value 為 null)。");

                var claims = new List<Claim>
                {
                    new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                    new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                    new Claim(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
                    new Claim(ClaimTypes.Name, user.UserName ?? string.Empty),
                    new Claim("Avatar", user.Avatar ?? "") //不用常常查資料庫，直接放在 JWT 裡
                };

                var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.Key));
                var creds = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

                var token = new JwtSecurityToken(
                    issuer: settings.Issuer,
                    audience: settings.Audience,
                    claims: claims,
                    notBefore: DateTime.UtcNow,
                    expires: DateTime.UtcNow.AddDays(30),
                    signingCredentials: creds);

                return new JwtSecurityTokenHandler().WriteToken(token);
            }

            //使用者點擊連結，瀏覽器記住 Email，跳轉回註冊頁時自動帶入顯示已驗證。
            public void SetPendingCookie(HttpContext context, string? email)
            {
                if (string.IsNullOrEmpty(email)) return;

                context.Response.Cookies.Append("PendingEmail", email, new CookieOptions
                {
                    HttpOnly = true,
                    Secure = false, // 正式環境請改 true
                    SameSite = SameSiteMode.Lax,
                    Expires = DateTime.UtcNow.AddMinutes(30)
                });
            }

            public void SetAuthCookie(HttpContext context, string token)
            {
                context.Response.Cookies.Append("AuthToken", token, new CookieOptions
                {
                    HttpOnly = true,
                    Secure = false,
                    SameSite = SameSiteMode.Lax,
                    Expires = DateTime.UtcNow.AddDays(30)
                });
            }

            // 2. 修正此方法：改用 Base64UrlEncode 並指向正確的 Controller Action
            public string GenerateConfirmUrl(HttpContext ctx, object userId, string code)
            {
                ArgumentNullException.ThrowIfNull(ctx);

                // 修正：配合 AuthApiController 的 Base64UrlDecode，這裡需使用 Base64UrlEncode
                var encodedCode = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));

                // 修正：指向 AuthApiController 的 ConfirmEmail Action (/AuthApi/ConfirmEmail)
                return $"{ctx.Request.Scheme}://{ctx.Request.Host}/AuthApi/ConfirmEmail?userId={userId}&code={encodedCode}";
            }

            public sealed class EmailSender : IEmailSender<ApplicationUser>
            {
                private readonly SendGridSettings _settings;

                public EmailSender(IOptions<SendGridSettings> settings)
                {
                    _settings = settings.Value;
                }

                public async Task SendConfirmationLinkAsync(ApplicationUser user, string email, string confirmationLink)
                {
                    var client = new SendGridClient(_settings.SendGridKey);
                    var from = new EmailAddress(_settings.FromEmail, "想想TripMatch");
                    var to = new EmailAddress(email);
                    var subject = "驗證您的電子郵件地址";
                    var htmlContent = $"<h3>歡迎註冊！</h3><p>請點擊以下連結驗證您的信箱：</p><a href='{confirmationLink}'>立即驗證</a>";

                    var msg = MailHelper.CreateSingleEmail(from, to, subject, "", htmlContent);
                    await client.SendEmailAsync(msg);
                }

                public Task SendPasswordResetLinkAsync(ApplicationUser user, string email, string resetLink) => Task.CompletedTask;

                public Task SendPasswordResetCodeAsync(ApplicationUser user, string email, string resetCode) => Task.CompletedTask;
            }
        }
    }
}