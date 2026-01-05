using System;
using System.Collections.Generic;

namespace TripMatch.Models;

/// <summary>
/// 行程主表：儲存旅遊行程的核心資訊
/// </summary>
public partial class Trip
{
    /// <summary>
    /// 行程自動編號主鍵
    /// </summary>
    public int Id { get; set; }

    /// <summary>
    /// 行程顯示標題
    /// </summary>
    public string Title { get; set; } = null!;

    /// <summary>
    /// 行程起始日期
    /// </summary>
    public DateOnly StartDate { get; set; }

    /// <summary>
    /// 行程結束日期
    /// </summary>
    public DateOnly EndDate { get; set; }

    /// <summary>
    /// 行程封面圖片 URL
    /// </summary>
    public string? CoverImageUrl { get; set; }

    /// <summary>
    /// 專屬邀請連結代碼 (GUID)，用於分享給朋友加入共編
    /// </summary>
    public Guid InviteCode { get; set; }

    /// <summary>
    /// 版本戳記，用於多人共同編輯時的衝突檢查 (RowVersion)
    /// </summary>
    public byte[] RowVersion { get; set; } = null!;

    /// <summary>
    /// 資料建立時間
    /// </summary>
    public DateTimeOffset? CreatedAt { get; set; }

    /// <summary>
    /// 資料最後更新時間
    /// </summary>
    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual ICollection<Accommodation> Accommodations { get; set; } = new List<Accommodation>();

    public virtual ICollection<Expense> Expenses { get; set; } = new List<Expense>();

    public virtual ICollection<Flight> Flights { get; set; } = new List<Flight>();

    public virtual ICollection<ItineraryItem> ItineraryItems { get; set; } = new List<ItineraryItem>();

    public virtual ICollection<Settlement> Settlements { get; set; } = new List<Settlement>();

    public virtual ICollection<TripMember> TripMembers { get; set; } = new List<TripMember>();

    public virtual ICollection<TripRegion> TripRegions { get; set; } = new List<TripRegion>();
}
