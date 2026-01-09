using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TripMatch.Models;

public partial class Recommandation
{
    public int Index { get; set; }

    public int GroupId { get; set; }

    public DateTime StartDate { get; set; }

    public DateTime EndDate { get; set; }

    public string Location { get; set; } = null!;

    public string? DepartFlight { get; set; }

    public string? ReturnFlight { get; set; }

    public string? Hotel { get; set; }

    public decimal Price { get; set; }

    public int Vote { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
    
    [JsonIgnore]
    public virtual TravelGroup Group { get; set; } = null!;
}
