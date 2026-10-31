import 'package:flutter/material.dart';
import 'package:user/features/rides/ride_display.dart';

String placeName(Map<String, dynamic> place) =>
    '${place['name'] ?? place['label'] ?? 'Saved place'}';
String placeType(Map<String, dynamic> place) => switch (place['place_type']) {
  'HOME' => 'Home',
  'WORK' => 'Work',
  _ => 'Place',
};
IconData placeIcon(Map<String, dynamic> place) => switch (place['place_type']) {
  'HOME' => Icons.home_outlined,
  'WORK' => Icons.work_outline,
  _ => Icons.place_outlined,
};
String placePerson(Map<String, dynamic> person) {
  final name = [
    person['first_name'],
    person['last_name'],
  ].where((p) => p != null && '$p'.trim().isNotEmpty).join(' ');
  return name.isEmpty ? '1More member' : name;
}

List<String> placePhotos(Map<String, dynamic> place) =>
    rideMaps(place['photos'])
        .map((p) => '${p['url'] ?? ''}')
        .where((url) => Uri.tryParse(url)?.scheme == 'https')
        .toList();
