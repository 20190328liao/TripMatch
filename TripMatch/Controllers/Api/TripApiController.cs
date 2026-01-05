using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Models.DTOs;
using TripMatch.Services;

namespace TripMatch.Controllers.Api
{
    [Route("api/[controller]")]
    [ApiController]
    public class TripApiController : ControllerBase
    {
        // 直接使用類別型別
        private readonly TripServices _tripServices;

        // 透過DI，給tripSerivces實體
        public TripApiController(TripServices tripServices)
        {
            _tripServices = tripServices;
        }

        [HttpGet]
        public IActionResult GetTrips()
        {
            List<Models.DTOs.TripDto> trips = _tripServices.GetMockTrips();
            return Ok(trips);
        }


        [HttpPost("Create")]
        public IActionResult Create([FromBody] TripCreateDto dto)
        {
            return Ok();
        }
    }
}
