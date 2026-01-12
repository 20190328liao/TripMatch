using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Services;

namespace TripMatch.Controllers.Api
{
    [Route("api/[controller]")]
    [ApiController]
    public class SpotApiController : ControllerBase
    {
        // 直接使用類別型別
        private readonly SpotServices _spotServices;

        // 透過DI，給spotServices實體
        public SpotApiController(SpotServices spotServices)
        {
            _spotServices = spotServices;
        }

    }
}
