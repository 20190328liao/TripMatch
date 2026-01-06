using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using TripMatch.Middleware;
using TripMatch.Services;

namespace TripMatch.Extensions
{
    public static class TagUserIdExtensions
    {
        // 擴展方法用來取得標記的使用者 ID
        // 服務註冊：builder.Services.AddTagUserId();
        public static IServiceCollection AddTagUserId(this IServiceCollection services)
        {
            services.AddHttpContextAccessor();
            services.AddScoped<TagUserId, TagUserIdAccessor>();
            return services;
        }

        // 中介件註冊（IApplicationBuilder）
        public static IApplicationBuilder UseTagUserId(this IApplicationBuilder app)
        {
            app.UseMiddleware<TagUserIdMiddleware>();
            return app;
        }

        // minimal WebApplication overload
        public static WebApplication UseTagUserId(this WebApplication app)
        {
            app.UseMiddleware<TagUserIdMiddleware>();
            return app;
        }
    }
}
