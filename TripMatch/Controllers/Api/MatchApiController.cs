using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Services;

namespace TripMatch.Controllers.Api
{
    [Route("api/[controller]")]
    [ApiController]
    public class MatchApiController : ControllerBase
    {
        // 直接使用類別型別
        private readonly MatchServices _matchServices;

        // 透過DI，給matchServices實體
        public MatchApiController(MatchServices matchServices)
        {
            _matchServices = matchServices;
        }
    }
}
