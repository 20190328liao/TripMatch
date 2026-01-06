using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Services;

namespace TripMatch.Controllers.Api
{
    [Route("api/[controller]")]
    [ApiController]
    public class BillingApiController : ControllerBase
    {
        // 直接使用類別型別
        private readonly BillingServices _billingServices;

        // 透過DI，給matchServices實體
        public BillingApiController(BillingServices billingServices)
        {
            _billingServices = billingServices;
        }

    }
}
