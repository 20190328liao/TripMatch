using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TripMatch.Models.DTOs
{
    public class MyTripsDto
    {
        public List<TripCardDto> Trips { get; set; } = new();
    }

    public static class SpotDto
    {
        public sealed class PlaceDto
        {
            [JsonPropertyName("placeId")]
            public string PlaceId { get; set; }

            [JsonPropertyName("name")]
            public string Name { get; set; } = "";

            [JsonPropertyName("rating")]
            public decimal? Rating { get; set; }

            [JsonPropertyName("address")]
            public string? Address { get; set; }

            [JsonPropertyName("phone")]
            public string? Phone { get; set; }

            [JsonPropertyName("weekdayText")]
            public string[]? WeekdayText { get; set; }

            [JsonPropertyName("photoUrl")]
            public string? PhotoUrl { get; set; }

            [JsonPropertyName("lat")]
            public decimal? Lat { get; set; }

            [JsonPropertyName("lng")]
            public decimal? Lng { get; set; }
        }

        /// <summary>
        /// spot.js currently calls: tripApi.addToWishlist({ place: currentPlace })
        /// </summary>
        public sealed class AddWishlistRequest
        {
            [JsonPropertyName("place")]
            public PlaceDto Place { get; set; } = new();
        }

        /// <summary>
        /// spot.js currently calls: tripApi.addToTripDay({ tripId, dayNo, place: currentPlace })
        /// </summary>
        public sealed class AddItineraryRequest
        {
            [JsonPropertyName("tripId")]
            public int TripId { get; set; }

            [JsonPropertyName("dayNo")]
            public int DayNo { get; set; }

            [JsonPropertyName("place")]
            public PlaceDto Place { get; set; } = new();
        }
    }
}

