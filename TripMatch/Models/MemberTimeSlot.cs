using System;
using System.Collections.Generic;

namespace TripMatch.Models;

public partial class MemberTimeSlot
{
    public int Id { get; set; }

    public int GroupId { get; set; }

    public int UserId { get; set; }

    public DateTime StartAt { get; set; }

    public DateTime EndAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual TravelGroup Group { get; set; } = null!;

    public virtual AspNetUser User { get; set; } = null!;
}
