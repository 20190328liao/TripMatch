using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TripMatch.Models;
using TripMatch.Models.DTOs;

namespace TripMatch.Services
{
    public class TripServices
    {

        private readonly TravelDbContext _context;

        // 透過建構子注入資料庫上下文
        public TripServices(TravelDbContext context)
        {
            _context = context;
        }

        public async Task<List<TripDto>> GetTrips()
        {
            List<TripDto> tripDtos = [];

           
            var trips = await _context.Trips.ToListAsync();            

            foreach (var trip in trips)
            {
                TripDto tripDto = new ()
                {
                    Title = trip.Title,
                };
                tripDtos.Add(tripDto);
            }
            return tripDtos;
        }

    }
}
