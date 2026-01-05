using System;
using System.Collections.Generic;

namespace TripMatch.Models;

/// <summary>
/// 行程成員與權限表
/// </summary>
public partial class TripMember
{
    /// <summary>
    /// 行程 ID
    /// </summary>
    public int TripId { get; set; }

    /// <summary>
    /// 使用者 ID
    /// </summary>
    public int UserId { get; set; }

    /// <summary>
    /// 角色：1=Owner, 2=Editor, 3=Viewer
    /// </summary>
    public byte RoleType { get; set; }

    /// <summary>
    /// 成員加入行程的時間 (包含時區資訊)
    /// </summary>
    public DateTimeOffset? JoinedAt { get; set; }

    /// <summary>
    /// 自動編號主鍵
    /// </summary>
    public int Id { get; set; }

    public virtual ICollection<ExpenseParticipant> ExpenseParticipants { get; set; } = new List<ExpenseParticipant>();

    public virtual ICollection<Expense> Expenses { get; set; } = new List<Expense>();

    public virtual ICollection<Settlement> SettlementFromUsers { get; set; } = new List<Settlement>();

    public virtual ICollection<Settlement> SettlementToUsers { get; set; } = new List<Settlement>();

    public virtual Trip Trip { get; set; } = null!;
}
