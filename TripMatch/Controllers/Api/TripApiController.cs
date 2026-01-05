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
        [HttpGet]
        public IActionResult GetTrips()
        {
            TripServices tripServices = new TripServices(); // 建立 TripServices 的實例，之後要改成注入
            List<Models.DTOs.TripDto> trips = tripServices.GetMockTrips();
            return Ok(trips);
        }


        [HttpPost("Create")]
        public IActionResult Create([FromBody] TripCreateDto dto)
        {
            return Ok();
        }
    }
}
