using System;
using System.Collections.Generic;

namespace TripMatch.Models;

/// <summary>
/// 行程細項排程表：儲存每日具體的景點或活動排程
/// </summary>
public partial class ItineraryItem
{
    /// <summary>
    /// 流水號主鍵
    /// </summary>
    public int Id { get; set; }

    /// <summary>
    /// 隸屬行程編號 (Trips.Id)
    /// </summary>
    public int TripId { get; set; }

    /// <summary>
    /// 項目類型：1=一般景點 (Normal), 2=隨機盲盒 (BlindBox)
    /// </summary>
    public int ItemType { get; set; }

    /// <summary>
    /// 景點快照編號 (Places_Snapshot.SpotId)
    /// </summary>
    public int? SpotId { get; set; }

    /// <summary>
    /// 行程天數順序 (例如 Day 1 填 1)
    /// </summary>
    public int DayNumber { get; set; }

    /// <summary>
    /// 預計開始時間 (HH:mm)
    /// </summary>
    public TimeOnly? StartTime { get; set; }

    /// <summary>
    /// 預計結束時間 (HH:mm)
    /// </summary>
    public TimeOnly? EndTime { get; set; }

    /// <summary>
    /// 手動排序順序 (當時間為空時依此顯示)
    /// </summary>
    public int SortOrder { get; set; }

    /// <summary>
    /// 盲盒開啟狀態：0=未開, 1=已開 (僅用於 ItemType=2)
    /// </summary>
    public bool IsOpened { get; set; }

    /// <summary>
    /// 最後執行修改的使用者編號 (用於多人編輯紀錄)
    /// </summary>
    public int? UpdatedByUserId { get; set; }

    /// <summary>
    /// 樂觀並行控制欄位 (Rowversion)，防止多人編輯衝突覆蓋
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

    public virtual ICollection<BlindBoxSubmission> BlindBoxSubmissions { get; set; } = new List<BlindBoxSubmission>();

    public virtual PlacesSnapshot? Spot { get; set; }

    public virtual Trip Trip { get; set; } = null!;
}
