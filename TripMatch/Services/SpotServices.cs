using Microsoft.EntityFrameworkCore;
using System;
using TripMatch.Models;
using TripMatch.Models.DTOs;

namespace TripMatch.Services
{
    public class SpotServices
    {
        private readonly TravelDbContext _context;

        // 透過建構子注入資料庫上下文
        public SpotServices(TravelDbContext context)
        {
            _context = context;
        }

        // 在下面開始添加與景點相關的服務方法
        // 我的行程
        
    }
}

