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
                TripDto tripDto = new()
                {
                    Title = trip.Title,
                };
                tripDtos.Add(tripDto);
            }
            return tripDtos;
        }

        public async Task<int> AddTrip(TripCreateDto tripDto)
        {
            Trip trip = new Trip()
            {
                Title = tripDto.Title,
                StartDate = tripDto.StartDate,
                EndDate = tripDto.EndDate,
                InviteCode = Guid.NewGuid(),
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            };
            _context.Trips.Add(trip);
            await _context.SaveChangesAsync();

            foreach (var placeID in tripDto.PlaceIds)
            {
                GlobalRegion globalRegion = new GlobalRegion()
                {
                    Name = "Unknown",
                    NameEn = "Unknown",
                    Level = 2,
                    IsHot = true,
                    PlaceId = placeID,
                };
                _context.GlobalRegions.Add(globalRegion);
                await _context.SaveChangesAsync();
            }


            return trip.Id;

        }

    }
}
