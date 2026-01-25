using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TripMatch.Models;
using TripMatch.Models.DTOs;
using TripMatch.Services.Common;
using TripMatch.Services.ExternalClients;


namespace TripMatch.Services
{
    public class TripServices
    {

        private readonly TravelDbContext _context;

        private readonly GooglePlacesClient _googlePlacesClient;

        private readonly AirLabsClient _airLabsClient;

        private readonly SharedService _sharedService;

        public TripServices(TravelDbContext context, SharedService sharedService, GooglePlacesClient googlePlacesClient, AirLabsClient airLabsClient)
        {
            _context = context;
            _sharedService = sharedService;
            _googlePlacesClient = googlePlacesClient;
            _airLabsClient = airLabsClient;
        }

        #region 行程資訊
        // 取得所有行程列表 (簡易資訊)
        public async Task<List<TripSimpleDto>> GetTrips(int? userId)
        {
            List<TripSimpleDto> tripDtos = [];

            List<Trip> trips = await _context.Trips.Where(t => t.TripMembers.Any(tm => tm.UserId == userId)).ToListAsync();

            foreach (var trip in trips)
            {
                TripSimpleDto tripDto = new()
                {
                    Id = trip.Id,
                    Title = trip.Title,
                };
                tripDtos.Add(tripDto);
            }
            return tripDtos;
        }

        public async Task<TripSimpleDto> GetTripSimple(int tripId)
        {
            TripSimpleDto tripSimpleDto = new();

            List<GeoDto> tripRegions = [];

            var trip = await _context.Trips
                .FirstOrDefaultAsync(t => t.Id == tripId);

            var tripRegionDetail = await _context.GlobalRegions
                .Where(gr => gr.TripRegions.Any(tr => tr.TripId == tripId)).ToListAsync();


            if (tripRegionDetail != null)
            {
                foreach (var tr in tripRegionDetail)
                {
                    GeoDto geo = new()
                    {
                        Lat = (double)(tr.Lat ?? 0),
                        Lng = (double)(tr.Lng ?? 0)
                    };
                    tripRegions.Add(geo);
                }
            }



            if (trip != null)
            {
                tripSimpleDto.Id = trip.Id;
                tripSimpleDto.Title = trip.Title;
                tripSimpleDto.StartDate = trip.StartDate;
                tripSimpleDto.EndDate = trip.EndDate;
                tripSimpleDto.TripRegions = tripRegions;
            }
            return tripSimpleDto;
        }
        #endregion

        #region 建立行程    
        public async Task<int> AddTrip(int? userId, TripCreateDto tripDto)
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


            // 建立行程成員 (預設建立者為行程成員)
            TripMember tripMember = new TripMember
            {
                TripId = trip.Id,
                UserId = userId is not null ? userId.Value : 0,
                RoleType = 1, // Owner   
                JoinedAt = DateTimeOffset.Now
            };
            _context.TripMembers.Add(tripMember);
            await _context.SaveChangesAsync();

            // 建立行程感興趣的區域
            await AddTripRegions(trip.Id, tripDto.PlaceIds);


            return trip.Id;

        }

        // 建立行程感興趣的區域
        private async Task AddTripRegions(int tripId, string[] PlaceIds)
        {
            List<int> globalRegionIds = await AddGlobalRegionIfNotExists(PlaceIds);

            foreach (int regionId in globalRegionIds)
            {

                if (await _context.TripRegions.AnyAsync(tr => tr.TripId == tripId && tr.RegionId == regionId))
                    continue;

                TripRegion tripRegion = new()
                {
                    TripId = tripId,
                    RegionId = regionId,
                };
                _context.TripRegions.Add(tripRegion);
            }

            await _context.SaveChangesAsync();
        }

        // 新增感興趣的國家/地區到 GlobalRegions 資料表   
        private async Task<List<int>> AddGlobalRegionIfNotExists(String[] PlaceIds)
        {
            List<int> globalRegionsId = new List<int>();
            foreach (var placeID in PlaceIds)
            {
                // 先判斷資料庫是否有相同資料
                GlobalRegion? existingRegion = await _context.GlobalRegions
                    .FirstOrDefaultAsync(gr => gr.PlaceId == placeID);

                if (existingRegion != null)
                {
                    globalRegionsId.Add(existingRegion.Id);
                    continue;
                }

                // 透過Google Places API 補全 GlobalRegion 資料
                // 中文資料
                var task_zh = _googlePlacesClient.GetPlaceDetailsAsync(placeID, "zh-TW");

                // 英文資料
                var task_en = _googlePlacesClient.GetPlaceDetailsAsync(placeID, "en");

                await Task.WhenAll(task_zh, task_en);

                var dto_zh = await task_zh;
                var dto_en = await task_en;

                if (dto_zh != null)
                {
                    GlobalRegion globalRegion = new GlobalRegion()
                    {
                        Name = dto_zh.Result?.Name ?? "Unknown",
                        NameEn = dto_en != null ? dto_en.Result.Name : "Unknown",
                        Level = dto_zh.Result?.Types?.Contains("country") == true ? 1 : 2,
                        ParentId = null, // 先不處理父層關係    
                        PlaceId = placeID,
                        Lat = (decimal?)(dto_zh.Result?.Geometry?.Location?.Lat) ?? 0,
                        Lng = (decimal?)(dto_zh.Result?.Geometry?.Location?.Lng) ?? 0,
                        CountryCode = dto_zh.Result.AddressComponents?.FirstOrDefault(c => c.Types.Contains("country"))?.ShortName ?? "??",
                        IsHot = true,
                    };
                    _context.GlobalRegions.Add(globalRegion);
                    await _context.SaveChangesAsync();

                    globalRegionsId.Add(globalRegion.Id);
                }
            }
            return globalRegionsId;

        }

        #endregion

        #region 行程編輯相關

        //取得所有行程資料
        public async Task<TripDetailDto> GetTripDetail(int tripId)
        {
            TripDetailDto tripDetailDto = new();
            //先取得行程基本資料 

            // 只需一個 await，資料庫會執行一次 JOIN 查詢
            var trip = await _context.Trips
                .Include(t => t.ItineraryItems) // 一併抓出該行程的所有明細
                .FirstOrDefaultAsync(t => t.Id == tripId);

            // 回傳空的 DTO
            if (trip == null)
                return tripDetailDto;


            // 填寫tripInfo
            tripDetailDto.TripInfo = new TripSimpleDto
            {
                Id = trip.Id,
                Title = trip.Title,
                StartDate = trip.StartDate,
                EndDate = trip.EndDate
            };

            // 取得並填寫航班資料
            var flights = await _context.Flights.Where(f => f.TripId == tripId).ToListAsync();

            // 將 Entity 轉為 DTO
            foreach (var flight in flights)
            {
                FlightDto flightDto = new()
                {
                    Id = flight.Id,
                    TripId = flight.TripId,
                    Carrier = flight.Carrier ?? "",
                    FlightNumber = flight.FlightNumber,
                    FromAirport = flight.FromAirport ?? "",
                    ToAirport = flight.ToAirport ?? "",

                    DepTimeLocal = flight.DepartUtc.ToString("yyyy-MM-dd HH:mm"),
                    DepTimeUtc = flight.DepartUtc.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    ArrTimeLocal = flight.ArriveUtc.ToString("yyyy-MM-dd HH:mm"),
                    ArrTimeUtc = flight.ArriveUtc.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"),

                    // 將 byte[] 轉換為 Base64 字串
                    RowVersion = Convert.ToBase64String(flight.RowVersion!)
                };
                tripDetailDto.Flights.Add(flightDto);
            }


            // 取得並填寫住宿資料    
            var accommodations = await _context.Accommodations.Where(a => a.TripId == tripId).ToListAsync();
            // 將 Entity 轉為 DTO
            foreach (var accom in accommodations)
            {
                AccommodationDto accomDto = new()
                {
                    Id = accom.Id,
                    TripId = accom.TripId,
                    SpotId = accom.SpotId,
                    HotelName = accom.HotelName ?? "",
                    Address = accom.Address ?? "",
                    CheckInDate = accom.CheckInDate,
                    CheckOutDate = accom.CheckOutDate,
                    RowVersion = Convert.ToBase64String(accom.RowVersion!)
                };
                tripDetailDto.Accomadations.Add(accomDto);
            }




            // 如果行程存在，我們直接從 trip 中提取並排序明細
            // 這是在記憶體中進行的，非常快
            var itineraryItems = trip.ItineraryItems
                .OrderBy(item => item.DayNumber)
                .ThenBy(item => item.SortOrder)
                .ToList() ?? [];

            // 填充行程景點資料
            foreach (var item in itineraryItems)
            {
                if (item.SpotId == null)
                    continue; // 跳過沒有景點快照的項目


                //取得景點資訊(名稱, 地址, 照片...)
                var placesSnapshot = await _context.PlacesSnapshots.FirstOrDefaultAsync(sp => sp.SpotId == item.SpotId);
                SpotProfileDto spotProfile;

                if (placesSnapshot != null)
                {
                    // 1. 先宣告預設值為空字串
                    string firstPhotoUrl = "";

                    // 2. 嘗試反序列化 (包含防呆)
                    if (!string.IsNullOrWhiteSpace(placesSnapshot.PhotosSnapshot))
                    {
                        try
                        {
                            // 假設 JSON 格式是 ["url1", "url2"...]
                            var photos = System.Text.Json.JsonSerializer.Deserialize<List<string>>(placesSnapshot.PhotosSnapshot);

                            // 取第一筆，如果 list 為 null 或空，則給空字串
                            firstPhotoUrl = photos?.FirstOrDefault() ?? "";
                        }
                        catch
                        {
                            // 如果 JSON 格式錯誤 (例如 parse 失敗)，維持空字串，不讓程式崩潰
                            firstPhotoUrl = "";
                        }
                    }

                    spotProfile = new SpotProfileDto()
                    {
                        PlaceId = placesSnapshot.ExternalPlaceId ?? "",
                        Name_ZH = placesSnapshot.NameZh ?? "",
                        Address = placesSnapshot.AddressSnapshot ?? "",
                        PhotoUrl = firstPhotoUrl,
                        LocationCategoryId = placesSnapshot.LocationCategoryId ?? 2, // 預設為 2: 觀光景點
                        Lat = (double)placesSnapshot.Lat,
                        Lng = (double)placesSnapshot.Lng,
                        Rating = placesSnapshot.Rating ?? 0
                    };
                }
                else
                {
                    // 若找不到快照資料, 要給預設
                    // 前端後續要想辦法把place id 傳過來，不然只有spot id也沒有用
                    spotProfile = new SpotProfileDto()
                    {
                        PlaceId = "",
                        Name_ZH = "未知景點",
                        Address = "未知地址",
                        PhotoUrl = "",
                        Lat = 0,
                        Lng = 0,
                        Rating = 0
                    };
                }


                ItineraryItemDto itemDto = new()
                {
                    Id = item.Id,
                    TripId = item.TripId,
                    SpotId = (int)item.SpotId,
                    DayNumber = item.DayNumber,
                    StartTime = item.StartTime ?? new TimeOnly(0, 0),
                    EndTime = item.EndTime ?? new TimeOnly(0, 0),
                    SortOrder = item.SortOrder,
                    Profile = spotProfile,
                    RowVersion = Convert.ToBase64String(item.RowVersion!)
                };
                tripDetailDto.ItineraryItems.Add(itemDto);
            }

            return tripDetailDto;

        }
        // 新增住宿
        public async Task<bool> AddAccommodation(AccommodationDto dto)
        {
            Accommodation accommodation = new()
            {
                TripId = dto.TripId,
                SpotId = dto.SpotId,
                HotelName = dto.HotelName,
                Address = dto.Address,
                CheckInDate = dto.CheckInDate,
                CheckOutDate = dto.CheckOutDate,
                CreatedAt = DateTimeOffset.Now
            };
            try
            {
                _context.Accommodations.Add(accommodation);
                await _context.SaveChangesAsync();
                return true;
            }
            catch (Exception)
            {
                // 這裡可以 Log 錯誤原因
                return false;
            }
        }
        // 刪除住宿
        public async Task<bool> DeleteAccommodation(int id, string rowVersion)
        {
            var accommodation = await _context.Accommodations.FindAsync(id);
            if (accommodation == null) return false;

            // 使用泛型方法設定版本
            ApplyRowVersion(accommodation, rowVersion);

            _context.Accommodations.Remove(accommodation);
            await _context.SaveChangesAsync();
            return true;
        }
        // 新增景點
        public async Task<bool> TryAddSpotToTrip(int? userId, ItineraryItemDto dto)
        {




            // 1. 自動計算 SortOrder (取得該行程當天目前的最高序號 + 1)int? userId, ItineraryItemDto dto
            int nextSortOrder = await _context.ItineraryItems
                .Where(x => x.TripId == dto.TripId && x.DayNumber == dto.DayNumber)
                .Select(x => (int?)x.SortOrder) // 使用 int? 預防當天還沒資料的情況
                .MaxAsync() ?? 0;


            // 取得最後一個景點
            var lastItem = await _context.ItineraryItems
                .Where(x => x.TripId == dto.TripId && x.DayNumber == dto.DayNumber)
                .OrderByDescending(x => x.SortOrder)
                .FirstOrDefaultAsync();

            if (lastItem == null || lastItem.EndTime==null)
            {
                // 如果當天沒有任何景點，預設時間為 09:00 - 10:00
                lastItem = new ItineraryItem
                {
                    EndTime = new TimeOnly(9, 0)
                };
            }

            ItineraryItem item = new()
            {
                UpdatedByUserId = userId,
                TripId = dto.TripId,
                SpotId = dto.SpotId,
                DayNumber = dto.DayNumber,
                StartTime = lastItem.EndTime,
                EndTime = lastItem.EndTime.Value.AddHours(1),
                SortOrder = nextSortOrder + 1,
                ItemType = 1,
                IsOpened = true,
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            };

            try
            {
                _context.ItineraryItems.Add(item);
                await _context.SaveChangesAsync();
                return true;
            }
            catch (Exception)
            {
                // 這裡可以 Log 錯誤原因
                return false;
            }
        }
        // 刪除景點
        public async Task<bool> DeleteSpotFromTrip(int Id)
        {
            var existing = await _context.ItineraryItems
                    .FirstOrDefaultAsync(It => It.Id == Id);
            if (existing != null)
            {
                _context.ItineraryItems.Remove(existing);
                await _context.SaveChangesAsync();
                return true;
            }
            else
            {
                return false;
            }
        }
        // 更新景點時間
        public async Task<bool> UpdateSpotTime(SpotTimeDto dto)
        {
            // 1. 抓取目前資料庫的實體
            var spot = await _context.ItineraryItems.FindAsync(dto.Id);
            if (spot == null) return false;

            // 2. 套用版本檢查：告訴 EF 這一筆資料的「原始版本」是 dto 傳過來的那個
            ApplyRowVersion(spot, dto.RowVersion);

            // 3. 修改欄位
            spot.StartTime = dto.StartTime;
            spot.EndTime = dto.EndTime;

            // 4. 存檔。如果此時資料庫版本與 dto.RowVersion 不符，會噴出 DbUpdateConcurrencyException
            await _context.SaveChangesAsync();
            return true;
        }
        // 新增一天(往後)
        public async Task<bool> AddTripDay(int tripId)
        {
            var trip = await _context.Trips.FirstOrDefaultAsync(t => t.Id == tripId);
            if (trip == null)
                return false;
            trip.EndDate = trip.EndDate.AddDays(1);
            await _context.SaveChangesAsync();
            return true;
        }
        // 刪除一天
        public async Task<bool> DeleteTripDay(int tripId, int dayNum)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // 1. 取得行程基本資訊
                var trip = await _context.Trips.FindAsync(tripId);
                if (trip == null) return false;

                // 2. 刪除該天的所有項目 (景點、活動等)
                var itemsToDelete = _context.ItineraryItems
                    .Where(ii => ii.TripId == tripId && ii.DayNumber == dayNum);
                _context.ItineraryItems.RemoveRange(itemsToDelete);

                // 3. 處理遞補邏輯：將 DayNum 之後的所有項目 DayNumber 往前移 (Day - 1)
                var itemsToShift = _context.ItineraryItems
                    .Where(ii => ii.TripId == tripId && ii.DayNumber > dayNum)
                    .ToList();

                foreach (var item in itemsToShift)
                {
                    item.DayNumber -= 1;
                }

                // 4. 更新行程結束日期 (EndDate 減一天)
                trip.EndDate = trip.EndDate.AddDays(-1);

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return true;
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                // 這裡可以記錄 log: ex.Message
                return false;
            }
        }
        #endregion

        #region 景點快照與願望清單

        // 嘗試新增景點快照，若已存在則回傳既有的 SpotId
        public async Task<int> TryAddPlaceSnapshot(PlaceSnapshotDto Dto)
        {
            // 1. 先嘗試找出該筆資料
            var existingPlace = await _context.PlacesSnapshots
                .FirstOrDefaultAsync(ps => ps.ExternalPlaceId == Dto.ExternalPlaceId);

            // 2. 如果資料已存在，直接回傳 ID
            if (existingPlace != null)
            {
                return existingPlace.SpotId;
            }

            PlacesSnapshot obj = new()
            {
                ExternalPlaceId = Dto.ExternalPlaceId,
                NameZh = Dto.NameZh,
                NameEn = Dto.NameEn,
                LocationCategoryId = _sharedService.GetLocationCategoryId(Dto.LocationCategory),
                AddressSnapshot = Dto.Address,
                Lat = (decimal)Dto.Lat,
                Lng = (decimal)Dto.Lng,
                Rating = Dto.Rating,
                UserRatingsTotal = Dto.UserRatingsTotal,
                PhotosSnapshot = JsonSerializer.Serialize(Dto.PhotosSnapshot),
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            };

            try
            {
                _context.PlacesSnapshots.Add(obj);
                await _context.SaveChangesAsync();
                return obj.SpotId;
            }
            catch (DbUpdateException) // 3. 捕捉併發導致的唯一索引衝突
            {
                // 4. 當 SaveChanges 失敗，表示另一個請求剛好捷足先登寫入了
                // 此時資料庫已經有這筆資料了，我們再次查詢並取回它的 ID
                var reFetchedPlace = await _context.PlacesSnapshots
                    .AsNoTracking() // 建議用 NoTracking，因為剛才 Add 失敗的物件可能還在追蹤中
                    .FirstOrDefaultAsync(ps => ps.ExternalPlaceId == Dto.ExternalPlaceId);

                return reFetchedPlace?.SpotId ?? -1;
            }
        }

        // 檢查景點是否在使用者的願望清單中 
        public async Task<bool> IsInWishList(int? userId, int spotId)
        {
            if (userId == null)
                return false;
            var existing = await _context.Wishlists
                .FirstOrDefaultAsync(w => w.UserId == userId && w.SpotId == spotId);

            if (existing != null)
                return true;
            else
                return false;
        }

        public async Task<bool> UpdateWishList(int? userId, int spotId, bool AddToWishlist)
        {
            if (userId == null)
                return false;

            if (AddToWishlist)
            {
                // 檢查是否已存在
                var existing = await _context.Wishlists
                    .FirstOrDefaultAsync(w => w.UserId == userId && w.SpotId == spotId);
                if (existing != null)
                    return true;

                Wishlist wishlist = new()
                {
                    UserId = (int)userId,
                    SpotId = spotId,
                    Note = "",
                    CreatedAt = DateTimeOffset.Now,
                    UpdatedAt = DateTimeOffset.Now
                };
                _context.Wishlists.Add(wishlist);
                await _context.SaveChangesAsync();
                return true;
            }
            else
            {
                var existing = await _context.Wishlists
                    .FirstOrDefaultAsync(w => w.UserId == userId && w.SpotId == spotId);
                if (existing != null)
                {
                    _context.Wishlists.Remove(existing);
                    await _context.SaveChangesAsync();
                }
                return true;
            }
        }

        public async Task<List<PlaceSnapshotDto>> GetUserFavoritesNearLocationAsync(int? userId, GeoDto geo, double radiusKm = 50)
        {
            // 1. 先撈出該使用者的所有最愛景點
            // 這裡假設有一個 Favorites 資料表或關聯
            // 如果是多對多關係: _context.Spots.Where(s => s.Users.Any(u => u.Id == userId))
            var query = _context.Wishlists
                .Where(uf => uf.UserId == userId)
                .Select(uf => uf.Spot); // 取得關聯的 Spot 實體

            // 2. 在記憶體中過濾距離 (如果資料量不大，這是最簡單寫法)
            // 注意：EF Core 有些版本不支援在 LINQ 裡直接算複雜的 Math.Cos
            // 如果資料量很大 (上萬筆最愛)，建議用 SQL Geography 或是先用 Bounding Box 過濾

            var allFavorites = await query.ToListAsync();

            // 3. 計算距離並篩選
            var nearFavorites = allFavorites
                .Select(s => new
                {
                    Spot = s,
                    Distance = CalculateDistance((double)geo.Lat, (double)geo.Lng, (double)s.Lat, (double)s.Lng)
                })
                .Where(x => x.Distance <= radiusKm) // 過濾半徑內
                .OrderBy(x => x.Distance)           // 由近到遠排序
                .Select(x => x.Spot)
                .ToList();

            // 4. 將結果轉為 DTO
            List<PlaceSnapshotDto> placeSnapshotDtos = [];

            foreach (var spot in nearFavorites)
            {
                PlaceSnapshotDto dto = new()
                {
                    ExternalPlaceId = spot.ExternalPlaceId ?? "",
                    NameZh = spot.NameZh ?? "",
                    Address = spot.AddressSnapshot ?? "",
                    Lat = (double)spot.Lat,
                    Lng = (double)spot.Lng,
                    Rating = spot.Rating ?? 0,
                    PhotosSnapshot = !string.IsNullOrWhiteSpace(spot.PhotosSnapshot)
                        ? JsonSerializer.Deserialize<List<string>>(spot.PhotosSnapshot) ?? []
                        : []
                };
                placeSnapshotDtos.Add(dto);
            }

            return placeSnapshotDtos;
        }

        // 輔助：Haversine 公式計算兩點間距離 (單位：公里)
        private double CalculateDistance(double lat1, double lon1, double lat2, double lon2)
        {
            var R = 6371; // 地球半徑 (km)
            var dLat = ToRadians(lat2 - lat1);
            var dLon = ToRadians(lon2 - lon1);
            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) *
                    Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
            return R * c;
        }

        private double ToRadians(double angle) => angle * Math.PI / 180.0;



        //取得附近熱門景點
        public async Task<List<PlaceSnapshotDto>> GetNearbyPopularSpots(GeoDto geo, int radius = 5000, int maxResults = 15)
        {
            var placesResponse = await _googlePlacesClient.GetNearbyAttractionsAsync(geo.Lat, geo.Lng, radius);
            List<PlaceSnapshotDto> popularSpots = [];

            //設定結果數量
            maxResults = Math.Min(maxResults, placesResponse.Count);

            for (int i = 0; i < maxResults; i++)
            {
                var placeDetail = await _googlePlacesClient.GetPlaceDetailsAsync(placesResponse[i], "zh-TW");
                if (placeDetail != null)
                {
                    PlaceSnapshotDto spotDto = new PlaceSnapshotDto
                    {
                        ExternalPlaceId = placesResponse[i],
                        NameZh = placeDetail.Result.Name,
                        Address = placeDetail.Result.FormattedAddress,
                        Lat = placeDetail.Result.Geometry.Location.Lat,
                        Lng = placeDetail.Result.Geometry.Location.Lng,
                        Rating = placeDetail.Result.Rating ?? 0,
                        UserRatingsTotal = placeDetail.Result.UserRatingsTotal ?? 0,
                        PhotosSnapshot = placeDetail.Result.Photos?.Select(p => _googlePlacesClient.GetPhotoUrl(p.PhotoReference)).ToList() ?? new List<string>()
                    };
                    popularSpots.Add(spotDto);
                }
            }

            return popularSpots;
        }

        #endregion

        #region 我的行程主頁

        // 抓我自己的行程
        public async Task<MyTripsDto> GetMyTripsAsync(int? userId = null)
        {
            // 已開團 Trips
            var trips = await _context.TripMembers
                .AsNoTracking()
                .Where(tm => tm.UserId == userId)
                .OrderByDescending(tm => tm.Trip.StartDate)
                .Select(tm => new TripCardDto
                {
                    TripId = tm.Trip.Id,
                    Title = tm.Trip.Title,
                    StartDate = tm.Trip.StartDate,
                    EndDate = tm.Trip.EndDate,
                    CoverImageUrl = $"https://picsum.photos/seed/DEBUG-{tm.Trip.Id}/800/400",
                    //CoverImageUrl = string.IsNullOrWhiteSpace(tm.Trip.CoverImageUrl) ? $"https://picsum.photos/800/400?{tm.Trip.Id}" : tm.Trip.CoverImageUrl,
                    IsOwner = (tm.RoleType == 1),
                    DetailsUrl = $"/Trip/Edit?id={tm.TripId}",
                    MembersUrl = $"/Trip/Members?tripId={tm.Trip.Id}",
                    // 新增: 顯示該團人數
                    MemberCount = _context.TripMembers.Count(x => x.TripId == tm.TripId)
                })
                .ToListAsync();

            // 媒合中 groups
            var matchingGroupsRaw = await _context.TravelGroups
                .AsNoTracking()
                .Where(g => g.OwnerUserId == userId
                            && g.Status != "JOINING"
                            && (g.Status == "AAA" || g.Status == "BBB" || g.Status == "CCC" || g.Status == "DDD"))
                .OrderByDescending(g => g.CreatedAt)
                .Select(g => new
                {
                    g.GroupId,
                    g.Title,
                    g.Status
                })
                .ToListAsync();

            // 再投影成 DTO (要用 helper)
            var matchingGroups = matchingGroupsRaw.Select(g => new MatchingGroupCardDto
            {
                GroupId = g.GroupId,
                Title = g.Title,
                Status = g.Status,
                CoverImageUrl = $"https://picsum.photos/seed/GROUP-{g.GroupId}/800/400",
                DetailsUrl = MapStatusToUrl(g.Status ?? "", g.GroupId)
            }).ToList();

            return new MyTripsDto { 
                Trips = trips,
                MatchingGroups = matchingGroups
            };
        }

        // 依照 Status 轉換 Url
        private static string MapStatusToUrl(string status, int groupId)
        {
            return status switch
            {
                "AAA" => $"/Trip/aaa?groupId={groupId}",
                "BBB" => $"/Trip/bbb?groupId={groupId}",
                "CCC" => $"/Trip/ccc?groupId={groupId}",
                "DDD" => $"/Trip/ddd?groupId={groupId}",
                _ => "#"
            };
        }



        // return 成員名單
        public async Task<List<TripMemberDto>> GetMembersAsync(int userId, int tripId)
        {
            // 只有成員能查看
            var isMember = await _context.TripMembers
                .AsNoTracking()
                .AnyAsync(x => x.TripId == tripId && x.UserId == userId);

            if (!isMember) throw new UnauthorizedAccessException("Not a trip member.");

            // 搜尋該行程的所有成員
            var members = await _context.TripMembers
                .AsNoTracking()
                .Where(x => x.TripId == tripId)
                .OrderBy(x => x.RoleType)
                .Select(x => new TripMemberDto
                {
                    UserId = x.UserId,
                    RoleType = x.RoleType,
                    DisplayName = x.User.FullName ?? $"User#{x.UserId}"
                })
                .ToListAsync();
            return members;
        }

        // 刪除行程
        public async Task DeleteTripAsync(int userId, int tripId)
        {
            // 只允許 owner 刪除
            var myRole = await _context.TripMembers
                .Where(x => x.TripId == tripId && x.UserId == userId)
                .Select(x => (byte?)x.RoleType)
                .FirstOrDefaultAsync();

            if (myRole is null) throw new UnauthorizedAccessException("不是該行程成員。");
            if (myRole != 1) throw new UnauthorizedAccessException("只有團主有權刪除行程。");

            var trip = await _context.Trips.FindAsync(tripId);
            if (trip == null) return;

            // 用 Transaction 防止刪到一半斷掉
            using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                // === 先清記帳資料 ===
                // 1. 找出該 trip 底下的 expenses
                var expenseIds = await _context.Expenses
                    .Where(e => e.TripId == tripId)
                    .Select(e => e.ExpenseId)
                    .ToListAsync();

                if(expenseIds.Count > 0)
                {
                    // 2. 刪 ExpenseParticipants
                    var eps = _context.ExpenseParticipants.Where(ep => expenseIds.Contains(ep.ExpenseId));
                    _context.ExpenseParticipants.RemoveRange(eps);

                    // 3. 刪 ExpensePayers
                    var payers = _context.ExpensePayers.Where(p => expenseIds.Contains(p.ExpenseId));
                    _context.ExpensePayers.RemoveRange(payers);

                    // 4. 刪 Expenses
                    var expenses = _context.Expenses.Where(e => e.TripId == tripId);
                    _context.Expenses.RemoveRange(expenses);
                }

                // 5. 刪 Settlements
                var settlements = _context.Settlements.Where(s => s.TripId == tripId);
                _context.Settlements.RemoveRange(settlements);

                // 再刪 Trip 子表
                var members = _context.TripMembers.Where(tm => tm.TripId == tripId);
                _context.TripMembers.RemoveRange(members);

                // 刪 Trip
                _context.Trips.Remove(trip);

                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }

        // 離開行程
        public async Task LeaveTripAsync(int userId, int tripId)
        {
            var tm = await _context.TripMembers
                .FirstOrDefaultAsync(x => x.TripId == tripId && x.UserId == userId);

            if (tm == null) return;

            // owner 不允許直接 leave
            if (tm.RoleType == 1) throw new InvalidCastException("Owner cannot leave.");

            // === 記帳關聯檢查 ===
            // 1. ExpenseParticipant
            bool hasParticipant = await _context.ExpenseParticipants
                .AnyAsync(ep => ep.TripId == tripId && ep.UserId == userId);
            // 2. ExpensePayer
            bool hasPayer = await _context.ExpensePayers
                .AnyAsync(p => p.Member.UserId ==  userId && p.Member.TripId == tripId);

            // 3. Settlement
            bool hasSettlement = await _context.Settlements
                .AnyAsync(s => s.TripId == tripId && (s.FromUserId == userId || s.ToUserId == userId));

            // 檢查條件後才刪除
            if (hasParticipant || hasPayer || hasSettlement)
            {
                throw new InvalidOperationException(
                    "退出失敗: 您在此行程仍有分帳或結算紀錄，請先刪除相關記帳紀錄後再試一次。"
                );
            }

            _context.TripMembers.Remove(tm);
            await _context.SaveChangesAsync();
        }

        // 取得邀請碼
        public async Task<Guid> GetInviteCodeAsync(int userId, int tripId)
        {
            var isMember = await _context.TripMembers
                .AsNoTracking()
                .AnyAsync(tm => tm.TripId == tripId && tm.UserId == userId);

            if (!isMember)
            {
                throw new UnauthorizedAccessException("Not a member of this trip.");
            }

            var code = await _context.Trips
                .AsNoTracking()
                .Where(t => t.Id == tripId)
                .Select(t => t.InviteCode)
                .FirstOrDefaultAsync();

            if (code == Guid.Empty)
            {
                throw new Exception("InviteCode is empty.");
            }

            return code;
        }

        #endregion

        #region 航班資訊
        // 航線查詢
        public async Task<string> ProxyFlightRoutes(string depIata, string arrIata)
        {
            // 這裡只是單純的 Pass-through，但未來如果需要快取 (Cache) 或紀錄 Log，可以加在這裡
            return await _airLabsClient.GetRoutesAsync(depIata, arrIata);
        }

        // 航班詳細查詢
        public async Task<string> ProxyFlightDetail(string flightIata)
        {
            return await _airLabsClient.GetFlightDetailAsync(flightIata);
        }

        // 新增航班
        public async Task<bool> AddFlight(FlightDto dto)
        {
            if (dto == null) return false;

            try
            {
                var tripExists = await _context.Trips.AnyAsync(t => t.Id == dto.TripId);
                if (!tripExists) return false;

                // 3. 實體轉換 (Mapping)
                Flight flight = new()
                {
                    TripId = dto.TripId,
                    Carrier = dto.Carrier,
                    FlightNumber = dto.FlightNumber,
                    DepartUtc = dto.DepartDateTimeOffset,
                    ArriveUtc = dto.ArriveDateTimeOffset,
                    FromAirport = dto.FromAirport,
                    ToAirport = dto.ToAirport,
                    CreatedAt = DateTimeOffset.Now
                };

                // 4. 執行存檔
                _context.Flights.Add(flight);
                var result = await _context.SaveChangesAsync();

                // 5. 判斷是否成功寫入至少一筆資料
                return result > 0;
            }
            catch (Exception ex)
            {
                // 這裡可以記錄 Log，例如：_logger.LogError(ex, "儲存航班失敗");
                return false;
            }
        }


        public async Task<bool> DeleteFlight(int id, string rowVersion)
        {
            var flight = await _context.Flights.FindAsync(id);
            if (flight == null) return false;

            // 使用泛型方法設定版本
            ApplyRowVersion(flight, rowVersion);

            _context.Flights.Remove(flight);
            await _context.SaveChangesAsync();
            return true;
        }
        #endregion


        #region 共同編輯
        public async Task<TripSimpleDto?> GetTripInfoByInviteCode(string codeStr)
        {
            if (!Guid.TryParse(codeStr, out Guid inviteCode)) return null;

            var trip = await _context.Trips
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.InviteCode == inviteCode);

            if (trip == null) return null;



            //取得tripRegions
            var tripRegions = await _context.GlobalRegions
                .Where(gr => gr.TripRegions.Any(tr => tr.TripId == trip.Id))
                .ToListAsync();

            // 透過place id 取得 cover image url    
            string coverImageUrl = "";
            _googlePlacesClient.GetPlaceDetailsAsync(
                tripRegions.FirstOrDefault()?.PlaceId ?? "", "zh-TW").ContinueWith(task =>
                {
                    var dto = task.Result;
                    if (dto != null && dto.Result.Photos != null && dto.Result.Photos.Count > 0)
                    {
                        coverImageUrl = _googlePlacesClient.GetPhotoUrl(dto.Result.Photos[0].PhotoReference);
                    }
                }).Wait();  


            return new TripSimpleDto
            {
                Id = trip.Id,
                Title = trip.Title,
                StartDate = trip.StartDate,
                EndDate = trip.EndDate,
                PhotoUrl = coverImageUrl
                // 這裡可以偷渡 CoverImageUrl 給前端顯示，雖然 Dto 原本沒有，
                // 建議在 TripSimpleDto 或另建一個 TripInviteInfoDto 補上 CoverImageUrl
            };
        }

        // [新增] 執行加入行程
        public async Task<bool> JoinTripByInviteCode(int? userId, string codeStr)
        {
            if (!Guid.TryParse(codeStr, out Guid inviteCode)) return false;

            var trip = await _context.Trips.FirstOrDefaultAsync(t => t.InviteCode == inviteCode);
            if (trip == null) return false;

            // 檢查是否已經是成員
            bool isMember = await _context.TripMembers
                .AnyAsync(tm => tm.TripId == trip.Id && tm.UserId == userId);

            if (isMember) return true; // 已經是成員，視為成功直接導向

            // 加入成員
            var newMember = new TripMember
            {
                TripId = trip.Id,
                UserId = (int)userId,
                RoleType = 2, // 2 = Editor/Member
                JoinedAt = DateTimeOffset.Now
            };

            _context.TripMembers.Add(newMember);
            await _context.SaveChangesAsync();
            return true;
        }

        #endregion

        /// <summary>
        /// 統一處理樂觀並行控制的版本設定
        /// </summary>
        private void ApplyRowVersion<TEntity>(TEntity entity, string rowVersion) where TEntity : class
        {
            if (string.IsNullOrEmpty(rowVersion)) return;

            // 將 Base64 字串轉回 byte[]
            byte[] versionBytes = Convert.FromBase64String(rowVersion);

            // 告訴 EF Core：這個實體的 RowVersion 原始值應該是 versionBytes
            // EF 會在 SaveChangesAsync 時自動產生 WHERE RowVersion = ...
            _context.Entry(entity).Property("RowVersion").OriginalValue = versionBytes;
        }


        public async Task<bool> IsUserTripMember(int? userId, int tripId)
        {
            if (userId == null) return false;

            // 檢查該使用者是否在該行程的成員名單中
            return await _context.TripMembers
                .AnyAsync(tm => tm.TripId == tripId && tm.UserId == userId);
        }

    }
}
