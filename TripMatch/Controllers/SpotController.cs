using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;
using TripMatch.Services;

namespace TripMatch.Controllers
{
    public class SpotController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }

        // 我的行程
        private readonly SpotServices _spotServices;

        public SpotController(SpotServices spotServices)
        {
            _spotServices = spotServices;
        }

        
    }
}
