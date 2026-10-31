import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/components/ui/glass_chip.dart';
import 'package:user/features/saved_places/pages/saved_places_page.dart';
import 'package:user/features/saved_places/pages/place_detail_page.dart';
import 'package:user/features/saved_places/pages/place_picker_page.dart';
import 'package:user/features/saved_places/places.repo.dart';
import 'package:user/features/saved_places/widgets/place_components.dart';
import 'package:user/features/saved_places/widgets/place_map.dart';
import '../partner_program/partner_glass_test.dart' as glass;
import '../partner_program/partner_submission_test.dart' as helpers;

class PlaceFixture extends PlacesRepository {
  final requests = <String>[];
  final uploads = <String>[];
  final inputs = <Map<String, dynamic>>[];
  final reviewChanges = <String>[];
  Completer<Map<String, dynamic>>? pending;
  bool visited = false, saved = true, failPhoto = false;
  Map<String, dynamic> get place => {
    'id': '9007199254740993123',
    'name': 'River Cafe',
    'address': 'Barari Road, Bhagalpur',
    'latitude': '25.23',
    'longitude': '86.95',
    'place_type': 'OTHER',
    'description': 'A quiet spot by the river.',
    'created_by_id': 'me',
    'version': 2,
    'photos': <Map<String, dynamic>>[],
    'visitor_count': 2,
    'visitors': [
      {
        'user': {'id': 'a', 'first_name': 'Alex'},
      },
      {
        'user': {'id': 'b', 'first_name': 'Sam'},
      },
    ],
    'rating': 4.5,
    'review_count': 2,
    'saved': saved,
    'visited_at': visited ? '2026-10-31T07:00:00Z' : null,
    'own_review': null,
  };
  Map<String, dynamic> response(String query) => {
    'rows': [
      {...place, if (query.isNotEmpty) 'name': query},
      {...place, 'id': 'second', 'name': 'University Gardens'},
    ],
    'total': 2,
    'page': 1,
    'page_size': 20,
  };
  @override
  Future<Map<String, dynamic>> list({
    int page = 1,
    String query = '',
    String scope = 'all',
    String? type,
  }) async {
    requests.add('$scope:$query');
    return pending?.future ?? response(query);
  }

  @override
  Future<Map<String, dynamic>> detail(String id) async => {...place, 'id': id};
  @override
  Future<Map<String, dynamic>> reviews(String id, {int page = 1}) async => {
    'rows': [
      {
        'id': 'review',
        'user': {'first_name': 'Alex'},
        'score': 4,
        'comment': 'Comfortable place to stop.',
        'created_at': '2026-10-31T07:00:00Z',
      },
    ],
    'page': page,
    'total': 1,
    'page_size': 20,
  };
  @override
  Future<Map<String, dynamic>> profile() async => {
    'id': 'me',
    'first_name': 'Me',
  };
  @override
  Future<void> visit(String id, bool value) async {
    visited = value;
  }

  @override
  Future<void> bookmark(String id, bool value) async {
    saved = value;
  }

  @override
  Future<void> review(String id, int score, String comment) async {
    reviewChanges.add('$id:$score:$comment');
  }

  @override
  Future<void> removeReview(String id) async {
    reviewChanges.add('remove:$id');
  }

  @override
  Future<Map<String, dynamic>> reverse(
    double latitude,
    double longitude,
  ) async => {
    'display_name': 'River Cafe, Bhagalpur',
    'lat': '$latitude',
    'lon': '$longitude',
  };
  @override
  Future<List<Map<String, dynamic>>> search(String query) async => [
    {
      'lat': '25.24',
      'lon': '86.96',
      'display_name': 'University Gardens, Bhagalpur',
    },
  ];
  @override
  Future<String> save(Map<String, dynamic> input, {String? id}) async {
    inputs.add(input);
    return id ?? 'new-place';
  }

  @override
  Future<void> photo(
    String id,
    String path,
    String name,
    String requestKey,
  ) async {
    uploads.add(requestKey);
    if (failPhoto) {
      failPhoto = false;
      throw StateError('Connection lost');
    }
  }

  @override
  Future<List<Map<String, dynamic>>> legacy() async => [];
}

Widget fakeMap(PlaceMap map) => ColoredBox(
  color: const Color(0xFFBEDCD8),
  child: Center(
    child: Text('Map preview: ${map.selectedId ?? 'pick a point'}'),
  ),
);
void viewport(WidgetTester tester, Size size) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  setUpAll(() async {
    dotenv.loadFromString(
      envString: 'API_BASE_URL=https://places.example.test/api/v2',
    );
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    final font = File('.dart_tool/settings-preview-font.ttf');
    if (font.existsSync()) {
      await (FontLoader('Outfit')..addFont(
            Future.value(ByteData.sublistView(font.readAsBytesSync())),
          ))
          .load();
    }
  });
  testWidgets(
    'place pins and equal-size cards stay synchronized without a zoom transform',
    (tester) async {
      viewport(tester, const Size(390, 844));
      PlaceMap? map;
      await tester.pumpWidget(
        glass.shell(
          SavedPlacesPage(
            repository: PlaceFixture(),
            mapBuilder: (value) {
              map = value;
              return fakeMap(value);
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(map!.selectedId, '9007199254740993123');
      final controller = tester
          .widget<PageView>(find.byType(PageView))
          .controller!;
      expect(controller.viewportFraction, .87);
      await glass.capture(tester, 'saved-places-map-carousel');
      await tester.drag(find.byType(PageView), const Offset(-340, 0));
      await tester.pumpAndSettle();
      expect(map!.selectedId, 'second');
      map!.onSelected!('9007199254740993123');
      await tester.pumpAndSettle();
      expect(controller.page, 0);
      expect(map!.selectedId, '9007199254740993123');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'place search clears old query data and ignores an outdated request',
    (tester) async {
      final repo = PlaceFixture();
      await tester.pumpWidget(
        glass.shell(SavedPlacesPage(repository: repo, mapBuilder: fakeMap)),
      );
      await tester.pumpAndSettle();
      repo.pending = Completer();
      await tester.enterText(find.byKey(const ValueKey('place-search')), 'Old');
      await tester.pump(const Duration(milliseconds: 451));
      expect(find.byType(PlaceCard), findsNothing);
      final old = repo.pending!;
      repo.pending = null;
      await tester.enterText(
        find.byKey(const ValueKey('place-search')),
        'Newest',
      );
      await tester.pump(const Duration(milliseconds: 451));
      await tester.pumpAndSettle();
      old.complete(repo.response('Old'));
      await tester.pumpAndSettle();
      expect(find.text('Newest'), findsWidgets);
      expect(find.text('Old'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'place details use actual visitors and review data and persist visit state',
    (tester) async {
      viewport(tester, const Size(390, 844));
      final repo = PlaceFixture();
      await tester.pumpWidget(
        glass.shell(
          PlaceDetailPage(
            id: '9007199254740993123',
            repository: repo,
            mapBuilder: fakeMap,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('River Cafe'), findsOneWidget);
      await glass.capture(tester, 'saved-place-details-header');
      await helpers.press(tester, find.text('Mark visited'));
      expect(repo.visited, isTrue);
      expect(find.text('Visited by Alex, Sam'), findsOneWidget);
      expect(find.text('Call'), findsNothing);
      expect(find.text('Website'), findsNothing);
      await glass.capture(tester, 'saved-place-details-actions');
      await helpers.press(tester, find.text('Reviews'));
      await tester.scrollUntilVisible(
        find.text('Comfortable place to stop.'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('4/5'), findsOneWidget);
      expect(find.text('Comfortable place to stop.'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'map picker uses selected coordinates and saves only on final submit',
    (tester) async {
      viewport(tester, const Size(390, 844));
      final repo = PlaceFixture();
      PlaceMap? map;
      await tester.pumpWidget(
        glass.shell(
          PlacePickerPage(
            repository: repo,
            mapBuilder: (value) {
              map = value;
              return fakeMap(value);
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(repo.inputs, isEmpty);
      map!.onPicked!(const LatLng(25.25, 86.97));
      await tester.pump(const Duration(milliseconds: 1001));
      await tester.pumpAndSettle();
      await glass.capture(tester, 'saved-place-map-picker');
      await helpers.press(tester, find.text('Use this location'));
      expect(repo.inputs, isEmpty);
      final nameField = find
          .descendant(
            of: find.byType(PlaceSaveForm),
            matching: find.byType(TextFormField),
          )
          .first;
      await tester.enterText(nameField, 'River Cafe draft');
      await helpers.press(tester, find.text('Back to map'));
      await helpers.press(tester, find.text('Use this location'));
      await helpers.press(tester, find.byType(AppButton).last);
      expect(repo.inputs.single['latitude'], 25.25);
      expect(repo.inputs.single['longitude'], closeTo(86.97, .000001));
      expect(repo.inputs.single['name'], 'River Cafe draft');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'a failed photo upload retries the same key without creating the place again',
    (tester) async {
      final repo = PlaceFixture()..failPhoto = true;
      final file = File(
        '${Directory.systemTemp.path}/place-test-${DateTime.now().microsecondsSinceEpoch}.png',
      );
      await tester.runAsync(
        () => file.writeAsBytes(
          base64Decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
          ),
        ),
      );
      addTearDown(() async {
        if (await file.exists()) await file.delete();
      });
      await tester.pumpWidget(
        glass.shell(
          Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showModalBottomSheet<String>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => SizedBox(
                    height: 550,
                    child: PlaceSaveForm(
                      repository: repo,
                      initial: {
                        'name': 'River Cafe',
                        'address': 'Bhagalpur',
                        'latitude': 25.23,
                        'longitude': 86.95,
                      },
                      photos: [XFile(file.path)],
                    ),
                  ),
                ),
                child: const Text('Open form'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open form'));
      await tester.pumpAndSettle();
      expect(repo.uploads, isEmpty);
      await helpers.press(tester, find.byType(AppButton));
      expect(repo.inputs.length, 1);
      expect(repo.uploads.length, 1);
      await helpers.press(tester, find.text('Retry remaining photos'));
      expect(repo.inputs.length, 1);
      expect(repo.uploads.length, 2);
      expect(repo.uploads.first, repo.uploads.last);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'review editor validates and submits the selected rating and text',
    (tester) async {
      final repo = PlaceFixture();
      await tester.pumpWidget(
        glass.shell(
          Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showDialog<bool>(
                  context: context,
                  builder: (_) =>
                      PlaceReviewEditor(id: 'opaque-place', repository: repo),
                ),
                child: const Text('Open review'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open review'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save review'));
      await tester.pumpAndSettle();
      expect(repo.reviewChanges, isEmpty);
      await tester.tap(find.byTooltip('4 out of 5'));
      await tester.enterText(find.byType(TextFormField), '  Quiet place  ');
      await tester.tap(find.text('Save review'));
      await tester.pumpAndSettle();
      expect(repo.reviewChanges, ['opaque-place:4:Quiet place']);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final size in [const Size(320, 568), const Size(568, 320)]) {
    testWidgets('saved places remain usable at $size with large text', (
      tester,
    ) async {
      viewport(tester, size);
      await tester.pumpWidget(
        glass.shell(
          Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: SavedPlacesPage(
                repository: PlaceFixture(),
                mapBuilder: fakeMap,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(LiquidGlassChip), findsWidgets);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      await glass.capture(tester, 'saved-places-large-${size.width.toInt()}');
      await tester.ensureVisible(find.byType(PlaceCard).first);
      await tester.pumpAndSettle();
      expect(find.byType(PlaceCard).first.hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
