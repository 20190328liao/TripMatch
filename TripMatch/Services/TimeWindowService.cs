using Microsoft.EntityFrameworkCore;
using TripMatch.Models;
using TripMatch.Models.DTOs.TimeWindow;

namespace TripMatch.Services
{
    public class TimeWindowService
    {
        private readonly TravelDbContext _context;
        private readonly ITravelInfoService _travelInfoService;

        public TimeWindowService(TravelDbContext context, ITravelInfoService travelInfoService)
        {
            _context = context;
            _travelInfoService = travelInfoService;
        }

        // 1. 建團 (團長開團)
        // 回傳: 建立好的 TravelGroup 物件
        public async Task<TravelGroup> CreateGroupAsync(int ownerUserId, CreateGroupRequest request)
        {
            var group = new TravelGroup
            {
                OwnerUserId = ownerUserId,
                InviteCode = GenerateInviteCode(),
                TargetNumber = request.TargetNumber,
                Title = request.Title,
                DepartFrom = request.DepartFrom,
                TravelDays = request.TravelDays,

                DateStart = request.DateStart?.ToDateTime(TimeOnly.MinValue) ?? DateTime.Today,
                DateEnd = request.DateEnd?.ToDateTime(TimeOnly.MinValue) ?? DateTime.Today.AddDays(30),
                Status = "JOINING",
                CreatedAt = DateTime.Now,
                UpdateAt = DateTime.Now
            };

            _context.TravelGroups.Add(group);

            var member = new GroupMember
            {
                Group = group,
                UserId = ownerUserId,
                InviteCode = group.InviteCode,
                Role = "Owner",
                JoinedAt = DateTime.Now
            };
            _context.GroupMembers.Add(member);

            await _context.SaveChangesAsync();

            return group;
        }
        // 2. 加入群組 (成員加入)
        // 回傳: 加入的成員資訊
        public async Task<GroupMember> JoinGroupAsync(int userId, JoinGroupRequest request)
        {
            var group = await _context.TravelGroups
                .FirstOrDefaultAsync(g => g.InviteCode == request.InviteCode);

            if (group == null)
            {
                throw new Exception("找不到此邀請碼的群組");
            }

            var existingMember = await _context.GroupMembers
                .FirstOrDefaultAsync(m => m.GroupId == group.GroupId && m.UserId == userId);

            if (existingMember != null)
            {
                return existingMember;
            }

            var newMember = new GroupMember
            {
                GroupId = group.GroupId,
                UserId = userId,
                InviteCode = group.InviteCode,
                Role = "Member",
                JoinedAt = DateTime.Now
            };

            _context.GroupMembers.Add(newMember);
            await _context.SaveChangesAsync();

            var hasPreference = await _context.Preferences
            .AnyAsync(p => p.GroupId == group.GroupId && p.UserId == userId);

            if (!hasPreference)
            {
                _context.Preferences.Add(new Preference
                {
                    GroupId = group.GroupId,
                    UserId = userId,
                    CreatedAt = DateTime.Now
                });
                await _context.SaveChangesAsync();
            }

            return newMember;
        }

        // 輔助方法：產生邀請碼
        private string GenerateInviteCode()
        {
            const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            var random = new Random();
            return new string(Enumerable.Repeat(chars, 6)
                .Select(s => s[random.Next(s.Length)]).ToArray());
        }

        // 3. 取得群組狀態
        public async Task<object?> GetGroupStatusAsync(int groupId)
        {
            var group = await _context.TravelGroups
                .FirstOrDefaultAsync(g => g.GroupId == groupId);

            if (group == null) return null;

            var joinedCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId);
            var submittedCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.SubmittedAt != null);

            return new
            {
                groupId = group.GroupId,
                inviteCode = group.InviteCode,
                targetNumber = group.TargetNumber,
                joinedCount = joinedCount,
                submittedCount = submittedCount,
                status = group.Status,
                travelDays = group.TravelDays
            };
        }

        // 4. 更新或新增旅遊偏好
        public async Task<Preference> UpsertPreferenceAsync(int groupId, int userId, UpsertPreferenceRequest request)
        {
            await ValidateMemberAccessAsync(groupId, userId, requireNotSubmitted: true);

            var pref = await _context.Preferences
                .FirstOrDefaultAsync(p => p.GroupId == groupId && p.UserId == userId);

            if (pref == null)
            {
                pref = new Preference
                {
                    GroupId = groupId,
                    UserId = userId,
                    CreatedAt = DateTime.Now
                };
                _context.Preferences.Add(pref);
            }

            pref.HotelBudget = request.HotelBudget;
            pref.HotelRating = request.HotelRating;
            pref.Tranfer = request.Transfer;
            pref.PlacesToGo = request.PlacesToGo;
            pref.TotalBudget = request.TotalBudget;

            await _context.SaveChangesAsync();
            return pref;
        }

        // 5. 提交有空的時間 (Available Slots)
        public async Task SaveAvailabilityAsync(int groupId, int userId, List<AvailableSlotInput> slots)
        {
            // 1. 刪除舊資料：改用 MemberTimeSlots
            var oldRecords = _context.MemberTimeSlots
                .Where(x => x.GroupId == groupId && x.UserId == userId);

            _context.MemberTimeSlots.RemoveRange(oldRecords);

            // 2. 新增新資料：建立 MemberTimeSlot 物件
            // 注意：這裡假設你的 MemberTimeSlot 屬性名稱如下 (若不同請自行調整)
            var newRecords = slots.Select(slot => new MemberTimeSlot
            {
                GroupId = groupId,
                UserId = userId,
                // 假設資料表欄位叫 StartTime/EndTime，如果是 StartAt/EndAt 請修改
                StartAt = slot.StartAt,
                EndAt = slot.EndAt,
                CreatedAt = DateTime.Now
            });

            await _context.MemberTimeSlots.AddRangeAsync(newRecords);
            await _context.SaveChangesAsync();
        }

        // 6. 算出推薦的時間區段 (核心演算法)
        public async Task<List<CommonTimeRangeDto>> GetCommonTimeRangesAsync(int groupId)
        {
            var group = await _context.TravelGroups.FindAsync(groupId);
            if (group == null) return new List<CommonTimeRangeDto>();

            var targetCount = group.TargetNumber;
            var submittedCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.SubmittedAt != null);

            if (submittedCount == 0) return new List<CommonTimeRangeDto>();

            var slots = await _context.MemberTimeSlots
                .Where(s => s.GroupId == groupId)
                .ToListAsync();

            if (!slots.Any()) return new List<CommonTimeRangeDto>();

            int n = targetCount;
            int threshold = (n / 2) + 1;
            int minDays = group.TravelDays;

            var dayCount = new Dictionary<DateOnly, int>();
            var groupStart = DateOnly.FromDateTime(group.DateStart);
            var groupEnd = DateOnly.FromDateTime(group.DateEnd);

            foreach (var s in slots)
            {
                var sDate = DateOnly.FromDateTime(s.StartAt);
                var eDate = DateOnly.FromDateTime(s.EndAt);

                var slotStart = sDate < groupStart ? groupStart : sDate;
                var slotEnd = eDate > groupEnd ? groupEnd : eDate;

                if (slotStart > slotEnd) continue;

                for (var d = slotStart; d <= slotEnd; d = d.AddDays(1))
                {
                    if (dayCount.ContainsKey(d))
                        dayCount[d]++;
                    else
                        dayCount[d] = 1;
                }
            }

            var goodDays = dayCount.Where(kv => kv.Value >= threshold)
                                   .Select(kv => kv.Key)
                                   .OrderBy(d => d)
                                   .ToList();

            var ranges = new List<CommonTimeRangeDto>();

            for (int i = 0; i < goodDays.Count; i++)
            {
                var startDay = goodDays[i];
                int currentIdx = i;
                int minAttendance = dayCount[startDay];

                while (currentIdx + 1 < goodDays.Count &&
                       goodDays[currentIdx + 1] == goodDays[currentIdx].AddDays(1))
                {
                    currentIdx++;
                    var countOnThisDay = dayCount[goodDays[currentIdx]];
                    if (countOnThisDay < minAttendance) minAttendance = countOnThisDay;
                }

                var endDay = goodDays[currentIdx];
                int duration = endDay.DayNumber - startDay.DayNumber + 1;

                if (duration >= minDays)
                {
                    ranges.Add(new CommonTimeRangeDto(startDay, endDay, duration, minAttendance));
                }

                i = currentIdx;
            }

            return ranges;
        }

        // 7. 取得個人狀態 (前端用來顯示打勾或鎖定按鈕)
        public async Task<object> GetMyStatusAsync(int groupId, int userId)
        {
            var member = await _context.GroupMembers
                .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId);

            if (member == null) return null; // 或拋出錯誤

            // 檢查各項資料是否已填寫
            var hasPreferences = await _context.Preferences.AnyAsync(p => p.GroupId == groupId && p.UserId == userId);
            var hasSelectedTimeRange = await _context.MemberTimeSlots.AnyAsync(t => t.GroupId == groupId && t.UserId == userId);

            // 是否已提交 (鎖定)
            var isSubmitted = member.SubmittedAt != null;

            return new
            {
                isMember = true,
                role = member.Role,
                hasPreferences,
                hasSelectedTimeRange,
                isSubmitted
            };
        }


        // 8.生成推薦方案並存檔
        // 回傳：已經存進資料庫的 Recommandation 清單
        public async Task<List<Recommendation>> GenerateRecommandationsAsync(int groupId)
        {
            var existingRecs = await _context.Recommendations
                .Where(r => r.GroupId == groupId)
                .ToListAsync();

            if (existingRecs.Any())
            {
                return existingRecs;
            }

            var timeRanges = await GetCommonTimeRangesAsync(groupId);
            if (!timeRanges.Any()) return new List<Recommendation>();

            var rawPlaces = await _context.Preferences
                .Where(p => p.GroupId == groupId && !string.IsNullOrEmpty(p.PlacesToGo))
                .Select(p => p.PlacesToGo)
                .ToListAsync();

            var places = rawPlaces
                .SelectMany(str => str.Split(new[] { ',', '，' }, StringSplitOptions.RemoveEmptyEntries))
                .Select(p => p.Trim())
                .Where(p => !string.IsNullOrEmpty(p))
                .Distinct()
                .ToList();

            if (!places.Any()) places.Add("未定地點");

            var newRecommendations = new List<Recommendation>();

            foreach (var range in timeRanges)
            {
                foreach (var place in places)
                {
                    var travelInfo = await _travelInfoService.GetTravelInfoAsync(place, range.StartDate, range.EndDate);

                    var rec = new Recommendation
                    {
                        GroupId = groupId,
                        StartDate = range.StartDate.ToDateTime(TimeOnly.MinValue), // 轉回 DateTime 存 DB
                        EndDate = range.EndDate.ToDateTime(TimeOnly.MinValue),
                        Location = place,

                        DepartFlight = travelInfo.DepartFlight,
                        ReturnFlight = travelInfo.ReturnFlight,
                        Hotel = travelInfo.Hotel,
                        Price = travelInfo.Price,

                        Vote = 0,
                        CreatedAt = DateTime.Now,
                        UpdatedAt = DateTime.Now
                    };

                    newRecommendations.Add(rec);
                }
            }

            await _context.Recommendations.AddRangeAsync(newRecommendations);
            await _context.SaveChangesAsync();

            return newRecommendations;
        }

        // 9. 讀取個人請假/可用日 (LeaveDates)
        public async Task<List<AvailableSlotInput>> GetSuggestedPersonalScheduleAsync(int groupId, int userId)
        {
            var group = await _context.TravelGroups.FindAsync(groupId);
            if (group == null) return new List<AvailableSlotInput>();

            var tripStartDate = DateOnly.FromDateTime(group.DateStart);
            var tripEndDate = DateOnly.FromDateTime(group.DateEnd);

            var availableDates = await _context.LeaveDates
                .Where(l => l.UserId == userId && l.LeaveDate1.HasValue) // 過濾掉日期是空的
                .Where(l => l.LeaveDate1 >= tripStartDate && l.LeaveDate1 <= tripEndDate)
                .Select(l => l.LeaveDate1.Value) // 只把 DateOnly 取出來
                .ToListAsync();

            var suggestions = availableDates.Select(date => new AvailableSlotInput
            {
                StartAt = date.ToDateTime(TimeOnly.MinValue), // 00:00:00
                EndAt = date.ToDateTime(new TimeOnly(23, 59, 59)) // 23:59:59
            }).ToList();

            return suggestions;
        }

        // 10. 取得偏好設定
        public async Task<Preference?> GetMyPreferenceAsync(int groupId, int userId)
        {
            return await _context.Preferences
                .FirstOrDefaultAsync(p => p.GroupId == groupId && p.UserId == userId);
        }

        // 11. 取得已提交的時間
        public async Task<List<AvailableSlotInput>> GetMyTimeSlotsAsync(int groupId, int userId)
        {
            return await _context.MemberTimeSlots
                .Where(t => t.GroupId == groupId && t.UserId == userId)
                .Select(t => new AvailableSlotInput
                {
                    StartAt = t.StartAt,
                    EndAt = t.EndAt
                })
                .ToListAsync();
        }

        // 12. 提交投票
        // 回傳：這些方案投票後的最新票數 (Dictionary<RecommendationId, VoteCount>)
        public async Task<Dictionary<int, int>> SubmitVotesAsync(int groupId, int userId, List<int> recommendationIds)
        {
            var member = await _context.GroupMembers
                .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId);

            if (member == null) throw new Exception("非成員");

            var targets = await _context.Recommendations
                .Where(r => r.GroupId == groupId && recommendationIds.Contains(r.Index))
                .ToListAsync();

            foreach (var rec in targets)
            {
                rec.Vote += 1;
            }

            await _context.SaveChangesAsync();

            return targets.ToDictionary(k => k.Index, v => v.Vote);
        }

        // --- 私有保護機制 (Guards) ---

        // 驗證群組存在、使用者是成員、以及是否已鎖定
        // 回傳: (GroupMember, IsLocked)
        private async Task<GroupMember> ValidateMemberAccessAsync(int groupId, int userId, bool requireNotSubmitted = false)
        {
            var member = await _context.GroupMembers
                .Include(m => m.Group)
                .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId);

            if (member == null)
            {
                throw new KeyNotFoundException($"找不到群組 (ID: {groupId}) 或您不是該群組成員。");
            }

            if (requireNotSubmitted && member.SubmittedAt != null)
            {
                throw new InvalidOperationException("您已經提交過時間，無法再修改資料 (Submissions are locked)。");
            }

            return member;
        }
    }
}
