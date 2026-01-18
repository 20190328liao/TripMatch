using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.OAuth.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities; 
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using SendGrid;
using SendGrid.Helpers.Mail;
using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using TripMatch.Data;
using TripMatch.Models;
using TripMatch.Models.Settings;
using static TripMatch.Services.AuthServicesExtensions.AuthService;

namespace TripMatch.Services
{



    // 定義一個簡單的 Record 用於接收重設密碼請求
    public record ResetPasswordRequest(string Password);

    public static class AuthServicesExtensions
    {
        public static IServiceCollection AddIdentityServices(this IServiceCollection services, IConfiguration config)
        {
     
            // Authentication 讀取 Cookie 中的 JWT
            var jwtSettings = new JwtSettings();
            config.GetSection("Jwt").Bind(jwtSettings);
            services.Configure<JwtSettings>(config.GetSection("Jwt"));

           
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

                        if (context.Request.Cookies != null
          && context.Request.Cookies.TryGetValue("AuthToken", out var token)
          && !string.IsNullOrWhiteSpace(token))
                        {
                            context.Token = token;
                        }
                        return Task.CompletedTask;
                    }
                };
            })
            .AddGoogle(googleOptions =>
            {
                // 指定 SignInScheme 為 ExternalScheme
                // 這是解決 "Correlation failed" 的關鍵。因為預設方案是 JWT，Google 必須明確知道要使用 Cookie 來存取暫存狀態。
                googleOptions.SignInScheme = IdentityConstants.ExternalScheme;

                // 從 Configuration 讀取 secrets.json 的設定
                googleOptions.ClientId = config["Authentication:Google:ClientId"] ?? string.Empty;
                googleOptions.ClientSecret = config["Authentication:Google:ClientSecret"] ?? string.Empty;

                googleOptions.CallbackPath = "/LoginGoogle";

                // 請求 profile scope 以取得頭像
                googleOptions.Scope.Add("profile");
                
                // 將頭像 Claim 映射到 Principal
                googleOptions.ClaimActions.MapJsonKey("picture", "picture");
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

            var connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

            // 擴充方法
            services.AddIdentityServices(configuration);

            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseSqlServer(connectionString));

            // 將 services.AddIdentityApiEndpoints<ApplicationUser>() 改回傳統的 AddIdentity
            // 指定只用 ApplicationUser，讓 Role 保持預設
            services.AddIdentity<ApplicationUser, IdentityRole<int>>(options => {
                // 這裡可以放你的密碼設定
            })
            .AddEntityFrameworkStores<ApplicationDbContext>()
            .AddDefaultTokenProviders();

            //設定 Token 有效期限
            services.Configure<DataProtectionTokenProviderOptions>(options =>
            {
                options.TokenLifespan = TimeSpan.FromHours(24); // Email 確認 Token 有效 24 小時
            });

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
            private readonly SymmetricSecurityKey _signingKey;
            private readonly SigningCredentials _signingCredentials;

            public AuthService(UserManager<ApplicationUser> userManager, IOptions<JwtSettings> jwtSettings)
                => (_userManager, _jwtSettings, _signingKey, _signingCredentials) = Initialize(userManager, jwtSettings);

            private static (UserManager<ApplicationUser>, IOptions<JwtSettings>, SymmetricSecurityKey, SigningCredentials) Initialize(UserManager<ApplicationUser> userManager, IOptions<JwtSettings> jwtSettings)
            {
                var settings = jwtSettings?.Value ?? throw new InvalidOperationException("JwtSettings 尚未設定 (IOptions<JwtSettings>.Value 為 null)。");
                var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.Key));
                var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
                return (userManager, jwtSettings, key, creds);
            }

            // 修改：在產生 JWT 時一併加入 NameIdentifier，並在 SetAuthCookie 前刪除既有的 Cookie
            public string GenerateJwtToken(ApplicationUser user)
            {
                ArgumentNullException.ThrowIfNull(user);

                var settings = _jwtSettings.Value ?? throw new InvalidOperationException("JwtSettings 尚未設定 (IOptions<JwtSettings>.Value 為 null)。");

                var now = DateTime.UtcNow;
                var expires = now.AddDays(30);

                var claims = new List<Claim>
                {
                    // 標準 sub + 明確的 NameIdentifier (整數 ID)
                    new Claim(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                    new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                    new Claim(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                    new Claim(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Iat, new DateTimeOffset(now).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
                    new Claim(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
                    new Claim(ClaimTypes.Name, user.UserName ?? string.Empty),
                    new Claim("Avatar", user.Avatar ?? string.Empty)
                };

                var descriptor = new SecurityTokenDescriptor
                {
                    Issuer = _jwtSettings.Value.Issuer,
                    Audience = _jwtSettings.Value.Audience,
                    Subject = new ClaimsIdentity(claims),
                    NotBefore = now,
                    Expires = expires,
                    SigningCredentials = _signingCredentials
                };

                var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
                var token = handler.CreateToken(descriptor);
                return handler.WriteToken(token);
            }

            public void SetPendingCookie(HttpContext context, string? email)
            {
                if (string.IsNullOrEmpty(email)) return;

                context.Response.Cookies.Append("PendingEmail", email, new CookieOptions
                {
                    HttpOnly = true,
                    Secure = false, // 正式環境請改 true
                    SameSite = SameSiteMode.Lax,
                    Path = "/",                // ← 加上這行：確保 cookie 在整個站點可用
                    Expires = DateTime.UtcNow.AddMinutes(30)
                });
            }

            public void SetAuthCookie(HttpContext context, string token)
            {
                if (context == null) throw new ArgumentNullException(nameof(context));
                if (string.IsNullOrWhiteSpace(token)) return;

                // 先刪除舊的 cookie（保險）
                try { context.Response.Cookies.Delete("AuthToken"); } catch { /* ignore */ }

                // 解析 JWT 以取得 exp（若能）
                DateTimeOffset? expires = null;
                try
                {
                    var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
                    var jwt = handler.ReadJwtToken(token);
                    // JwtSecurityToken.ValidTo 為 UTC
                    expires = jwt.ValidTo == DateTime.MinValue ? null : new DateTimeOffset(jwt.ValidTo);
                }
                catch
                {
                    // 若解析失敗，不阻止寫入 cookie，採用安全短時過期
                    expires = DateTimeOffset.UtcNow.AddHours(8);
                }

                var cookieOptions = new CookieOptions
                {
                    HttpOnly = true,
                    // 以 request 是否為 https 決定 Secure；生產環境應強制 true
                    Secure = context.Request.IsHttps,
                    SameSite = SameSiteMode.None, // 若跨子域/第三方情形需用 None
                    Path = "/",
                    Expires = expires
                };

                context.Response.Cookies.Append("AuthToken", token, cookieOptions);
            }

            // 2. 改用 Base64UrlEncode 並指向正確的 Controller Action
            public string GenerateConfirmUrl(HttpContext ctx, object userId, string code)
            {
                ArgumentNullException.ThrowIfNull(ctx);

                // 配合 AuthApiController 的 Base64UrlDecode，這裡需使用 Base64UrlEncode
                var encodedCode = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));

                // 指向 AuthApiController 的 ConfirmEmail Action (/Auth/ConfirmEmail)
                return $"{ctx.Request.Scheme}://{ctx.Request.Host}/Auth/ConfirmEmail?userId={userId}&code={encodedCode}";
            }

            public sealed class EmailSender : IEmailSender<ApplicationUser>
            {
                private readonly SendGridSettings _settings;

                public EmailSender(IOptions<SendGridSettings> settings)
                    => _settings = settings.Value;

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

                // 實作重設密碼信件發送
                public async Task SendPasswordResetLinkAsync(ApplicationUser user, string email, string resetLink)
                {
                    var client = new SendGridClient(_settings.SendGridKey);
                    var from = new EmailAddress(_settings.FromEmail, "想想TripMatch");
                    var to = new EmailAddress(email);
                    var subject = "重設您的密碼 - TripMatch";
                    var htmlContent = $@"
                        <h3>重設密碼請求</h3>
                        <p>我們收到了重設您 TripMatch 帳號密碼的請求。</p>
                        <p>請點擊下方連結以設定新密碼：</p>
                        <a href='{resetLink}' style='padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;'>重設密碼</a>
                        <p>若您未提出此請求，請忽略此信件。</p>";

                    var msg = MailHelper.CreateSingleEmail(from, to, subject, "", htmlContent);
                    await client.SendEmailAsync(msg);
                }

                public async Task SendEmailAsync(string email, string subject, string message)
                {
                    var client = new SendGridClient(_settings.SendGridKey);
                    var from = new EmailAddress(_settings.FromEmail, "想想TripMatch");
                    var to = new EmailAddress(email);
                    var htmlContent = $"<p>{message}</p>";

                    var msg = MailHelper.CreateSingleEmail(from, to, subject, "", htmlContent);
                    await client.SendEmailAsync(msg);
                }

                public Task SendPasswordResetCodeAsync(ApplicationUser user, string email, string resetCode) => Task.CompletedTask;
            }

        }

        // 擴展方法：為 IEmailSender<ApplicationUser> 添加 SendEmailAsync
        public static async Task SendEmailAsync(this IEmailSender<ApplicationUser> emailSender, string email, string subject, string message)
        {
            if (emailSender is AuthServicesExtensions.AuthService.EmailSender sender)
            {
                await sender.SendEmailAsync(email, subject, message);
            }
            else
            {
                throw new NotSupportedException("The email sender does not support sending custom emails.");
            }
        }
    }
}