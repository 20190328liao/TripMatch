using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Services;

namespace TripMatch.Controllers.Api
{
    [Route("api/[controller]")]
    [ApiController]
    public class TripApiController : ControllerBase
    {
        [HttpGet]
        public IActionResult GetTrips()
        {
            TripServices tripServices = new TripServices(); 
            List<Models.DTOs.TripDto> trips = tripServices.GetMockTrips();
            return Ok(trips);
        }
    }
}
