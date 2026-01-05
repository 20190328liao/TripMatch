using System;
using System.Collections.Generic;

namespace TripMatch.Models;

public partial class LeaveDate
{
    public int LeaveId { get; set; }

    public int UserId { get; set; }

    public DateOnly? LeaveDate1 { get; set; }

    public DateTime? LeaveDateAt { get; set; }

    public virtual AspNetUser User { get; set; } = null!;
}
