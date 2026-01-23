using System;
using System.Collections.Generic;

namespace TripMatch.Models;

public partial class RecommendationVote
{
    public int Id { get; set; }

    public int GroupId { get; set; }

    public int UserId { get; set; }

    public int RecommendationId { get; set; }

    public DateTime? CreatedAt { get; set; }
}
