import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/core/routes.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/widgets/trip_actions_panel.dart';
import 'package:user/features/notifications/pages/notifications_page.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'package:user/features/rides/pages/rides_page.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/widgets/booking_review_sheet.dart';
import 'package:user/features/rides/widgets/trip_cancellation_dialog.dart';
import 'package:user/features/rides/widgets/trip_receipt_sheet.dart';
import 'package:user/features/saved_places/widgets/saved_place_editor.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class BookingRepo extends UserAppRepository {
  int requests = 0;
  String state = 'DRAFT';
  bool commitBeforeFailure = false;
  bool readFails = false, malformedRead = false;
  Completer<Map<String, dynamic>>? pendingRead;
  final keys = <String?>[];
  final notes = <String?>[];
  @override
  Future<Map<String, dynamic>> requestRide(
    String rideId,
    String quoteId, {
    String method = 'CASH',
    String? note,
    String? requestKey,
  }) async {
    requests++;
    keys.add(requestKey);
    notes.add(note);
    if (commitBeforeFailure) state = 'SEARCHING';
    throw StateError('Connection lost');
  }

  @override
  Future<Map<String, dynamic>> ride(String id) async {
    if (pendingRead != null) return pendingRead!.future;
    if (readFails) throw StateError('Status unavailable');
    return malformedRead ? {'id': id} : {'id': id, 'status': state};
  }
}

class TripRepo extends DriverOperationsRepository {
  bool fail = false, driver = false;
  bool mismatchedTrip = false;
  DateTime? locationTime;
  String status = 'SEARCHING';
  Completer<Map<String, dynamic>>? pendingRoute;
  @override
  Future<Map<String, dynamic>> context(String id) async {
    if (fail) throw StateError('Offline');
    return {
      'ride_id': id,
      'status': status,
      'is_driver': driver,
      'server_time': DateTime.now().toUtc().toIso8601String(),
      'driver_location_fresh': locationTime != null,
      'driver_location': locationTime == null
          ? null
          : {
              'latitude': '25.23',
              'longitude': '86.95',
              'captured_at': locationTime!.toIso8601String(),
            },
      'payment': {'status': 'CAPTURED'},
      'payment_options': {'cash': true, 'upi': false},
      'trip': {
        'id': mismatchedTrip ? 'other-trip' : id,
        'status': status,
        'pickup_address': 'Station',
        'dropoff_address': 'University',
        'pickup_latitude': '25.23',
        'pickup_longitude': '86.95',
        'dropoff_latitude': '25.24',
        'dropoff_longitude': '86.96',
        'estimated_fare': '50',
        'requested_at': DateTime.now()
            .subtract(const Duration(minutes: 4))
            .toIso8601String(),
      },
    };
  }

  @override
  Future<Map<String, dynamic>> riderRoute(String id) async =>
      pendingRoute != null
      ? pendingRoute!.future
      : {
          'target': status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP',
          'duration_s': 120,
          'captured_at': locationTime?.toIso8601String(),
          'distance_m': 400,
          'geometry': [
            [86.95, 25.23],
            [86.96, 25.24],
          ],
        };
  @override
  Future<Map<String, dynamic>> payment(String id, String method) async => {
    'payment': {
      'status': 'CAPTURED',
      'amount': '50',
      'recipient_upi': 'driver@upi',
    },
  };
}

class NoticeRepo extends UserAppRepository {
  int marked = 0;
  @override
  Future<List<Map<String, dynamic>>> notifications() async => [
    {
      'id': 'notice',
      'read_at': '2026-10-24',
      'title': 'Driver assigned',
      'body': 'Open your ride',
      'data': {'ride_id': 'ride'},
    },
  ];
  @override
  Future<void> readNotification(String id) async {
    marked++;
  }
}

class PlacesRepo extends UserAppRepository {
  final searches = <String>[];
  @override
  Future<List<Map<String, dynamic>>> searchPlaces(String query) async {
    searches.add(query);
    return [
      {'display_name': 'Selected station', 'lat': '25.23', 'lon': '86.95'},
    ];
  }
}

class HistoryRepo extends UserAppRepository {
  final sections = <String>[];
  final pages = <int>[];
  @override
  Future<Map<String, dynamic>> riderHistory({
    int page = 1,
    String section = 'all',
    String query = '',
    String? categoryId,
    String? month,
  }) async {
    sections.add(section);
    pages.add(page);
    return {
      'rows': <Map<String, dynamic>>[],
      'total': 0,
      'page': page,
      'page_size': 20,
    };
  }
}

Widget harness(Widget child, {String? ride}) => ScreenUtilInit(
  designSize: const Size(390, 844),
  builder: (_, _) => MaterialApp(
    routes: {'/': (_) => child},
    navigatorObservers: [appRouteObserver],
    onGenerateInitialRoutes: (_) => [
      MaterialPageRoute<void>(
        settings: RouteSettings(name: AppRoutes.rideDetail, arguments: ride),
        builder: (_) => child,
      ),
    ],
  ),
);

Future<void> openBooking(
  WidgetTester tester,
  BookingRepo repo, {
  bool expired = false,
  Map<String, dynamic>? quote,
}) async {
  await tester.pumpWidget(
    harness(
      Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () async {
              final result = await showModalBottomSheet<BookingReviewResult>(
                context: context,
                isScrollControlled: true,
                builder: (_) => BookingReviewSheet(
                  draftId: 'ride',
                  pickup: 'Station',
                  dropoff: 'University',
                  method: 'CASH',
                  repository: repo,
                  quote:
                      quote ??
                      {
                        'id': 'quote',
                        'total_fare': '50',
                        'distance_fare': '50',
                        'expires_at': DateTime.now()
                            .add(Duration(minutes: expired ? -1 : 5))
                            .toIso8601String(),
                        'category_snapshot': {'name': 'Bike', 'capacity': 1},
                      },
                ),
              );
              if (context.mounted && result?.rideId != null) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Booked ${result!.rideId}')),
                );
              }
            },
            child: const Text('Open review'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open review'));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://ride.example.test/api/v2',
    ),
  );

  testWidgets('a mismatched inner trip cannot be displayed or acted on', (
    tester,
  ) async {
    final repo = TripRepo()..mismatchedTrip = true;
    await tester.pumpWidget(
      harness(
        RideDetailPage(
          operationsRepository: repo,
          mapBuilder: (_) => const SizedBox(),
        ),
        ride: 'ride',
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.textContaining('not available to your rider account'),
      findsOneWidget,
    );
    expect(find.text('Cancel ride'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'rider detail stays within a narrow viewport through the trip stages',
    (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repo = TripRepo();
      await tester.pumpWidget(
        harness(
          RideDetailPage(
            operationsRepository: repo,
            mapBuilder: (_) => const SizedBox(),
          ),
          ride: 'ride',
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      for (final status in [
        'DRIVER_WAITING',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED',
      ]) {
        repo.status = status;
        await tester.tap(find.byTooltip('Refresh ride'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: status);
      }
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'fresh options stay blocked when an uncertain booking cannot be checked',
    (tester) async {
      final repo = BookingRepo()..readFails = true;
      final quote = {
        'id': 'quote',
        'total_fare': '50',
        'expires_at': DateTime.now()
            .add(const Duration(minutes: 5))
            .toIso8601String(),
      };
      await openBooking(tester, repo, quote: quote);
      await tester.ensureVisible(find.text('Confirm booking'));
      await tester.tap(find.text('Confirm booking'));
      await tester.pumpAndSettle();
      quote['expires_at'] = DateTime.now()
          .subtract(const Duration(minutes: 1))
          .toIso8601String();
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      await tester.ensureVisible(find.text('Get fresh ride options'));
      await tester.tap(find.text('Get fresh ride options'));
      await tester.pumpAndSettle();
      expect(find.text('Review your ride'), findsOneWidget);
      expect(
        find.textContaining('booking status could not be verified'),
        findsOneWidget,
      );
      expect(repo.requests, 1);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('a malformed booking status never implies a committed booking', (
    tester,
  ) async {
    final repo = BookingRepo()..malformedRead = true;
    await openBooking(tester, repo);
    await tester.ensureVisible(find.text('Confirm booking'));
    await tester.tap(find.text('Confirm booking'));
    await tester.pumpAndSettle();
    expect(find.text('Booked ride'), findsNothing);
    expect(find.text('Review your ride'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'disposing during a booking status check does not submit or call setState',
    (tester) async {
      final repo = BookingRepo();
      await openBooking(tester, repo);
      await tester.ensureVisible(find.text('Confirm booking'));
      await tester.tap(find.text('Confirm booking'));
      await tester.pumpAndSettle();
      final pending = Completer<Map<String, dynamic>>();
      repo.pendingRead = pending;
      await tester.ensureVisible(find.text('Check and retry booking'));
      await tester.tap(find.text('Check and retry booking'));
      await tester.pump();
      await tester.pumpWidget(const SizedBox.shrink());
      pending.complete({'id': 'ride', 'status': 'DRAFT'});
      await tester.pump();
      expect(repo.requests, 1);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('an in-flight pickup route is discarded when the trip starts', (
    tester,
  ) async {
    final pending = Completer<Map<String, dynamic>>();
    final repo = TripRepo()
      ..status = 'DRIVER_ASSIGNED'
      ..locationTime = DateTime.now()
      ..pendingRoute = pending;
    await tester.pumpWidget(
      harness(
        RideDetailPage(
          operationsRepository: repo,
          mapBuilder: (_) => const SizedBox(),
        ),
        ride: 'ride',
      ),
    );
    await tester.pumpAndSettle();
    repo.status = 'IN_PROGRESS';
    await tester.tap(find.byTooltip('Refresh ride'));
    await tester.pumpAndSettle();
    expect(find.textContaining('to drop-off'), findsNothing);
    expect(find.textContaining('to pickup'), findsNothing);
    repo.pendingRoute = null;
    pending.complete({
      'target': 'PICKUP',
      'captured_at': DateTime.now().toIso8601String(),
      'duration_s': 120,
      'distance_m': 400,
      'geometry': [
        [86.95, 25.23],
        [86.96, 25.24],
      ],
    });
    await tester.pumpAndSettle();
    expect(find.textContaining('to drop-off'), findsOneWidget);
    expect(find.textContaining('to pickup'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'old GPS is labelled last known even when a snapshot freshness flag is true',
    (tester) async {
      final repo = TripRepo()
        ..status = 'DRIVER_ASSIGNED'
        ..locationTime = DateTime.now().subtract(const Duration(seconds: 65));
      await tester.pumpWidget(
        harness(
          RideDetailPage(
            operationsRepository: repo,
            mapBuilder: (_) => const SizedBox(),
          ),
          ride: 'ride',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('to pickup'), findsNothing);
      expect(find.textContaining('Last known driver location'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('a UPI race with confirmed receipt never opens another payment', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        Scaffold(
          body: TripActionsPanel(
            rideId: 'ride',
            repository: TripRepo(),
            onChanged: () async {},
            externalContext: {
              'status': 'COMPLETED',
              'is_driver': false,
              'payment': {'status': 'PENDING'},
              'payment_options': {'cash': true, 'upi': true},
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pay driver via UPI'));
    await tester.pumpAndSettle();
    expect(find.textContaining('payment has already changed'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'cancellation shows a proposed reviewed fee without claiming collection',
    (tester) async {
      await tester.pumpWidget(
        harness(
          Scaffold(
            body: TripCancellationDialog(
              contextData: {
                'cancellation': {
                  'free_until': '2026-10-24T12:00:00Z',
                  'maximum_proposed_fee': '5',
                },
              },
            ),
          ),
        ),
      );
      expect(find.textContaining('INR 5.00'), findsOneWidget);
      expect(find.textContaining('No fee is collected now'), findsOneWidget);
      expect(find.text('Keep ride'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('a waived receipt stays clearly distinct from a paid receipt', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        const Scaffold(
          body: TripReceiptSheet(
            data: {
              'trip': {
                'id': 'ride',
                'final_fare': '50',
                'pickup_address': 'Station',
                'dropoff_address': 'University',
              },
              'payment': {'status': 'CANCELLED'},
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Fare waived'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('The fare has been waived; it is not payable.'),
      200,
    );
    expect(
      find.text('The fare has been waived; it is not payable.'),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'an already-read ride notification can still open its owned trip',
    (tester) async {
      final repo = NoticeRepo();
      await tester.pumpWidget(
        ScreenUtilInit(
          designSize: const Size(390, 844),
          builder: (_, _) => MaterialApp(
            home: NotificationsPage(
              repository: repo,
              operationsRepository: TripRepo(),
            ),
            routes: {
              AppRoutes.rideDetail: (_) =>
                  const Scaffold(body: Text('Opened owned ride')),
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Driver assigned'));
      await tester.pumpAndSettle();
      expect(find.text('Opened owned ride'), findsOneWidget);
      expect(repo.marked, 0);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  test(
    'display parsing accepts Decimal strings and rejects invalid GPS and fabricated amounts',
    () {
      expect(ridePoint('25.23', '86.95')?.latitude, 25.23);
      expect(ridePoint('NaN', 86.95), isNull);
      expect(ridePoint(91, 86.95), isNull);
      expect(rideMoney(null), 'Unavailable');
      expect(
        staticTripSummary({'id': 'trip', 'status': 'SEARCHING'}),
        contains('not live tracking'),
      );
    },
  );

  testWidgets('an expired quote cannot create a booking', (tester) async {
    final repo = BookingRepo();
    await openBooking(tester, repo, expired: true);
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Confirm booking'),
    );
    expect(button.onPressed, isNull);
    expect(repo.requests, 0);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a lost booking response reconciles the committed ride', (
    tester,
  ) async {
    final repo = BookingRepo()..commitBeforeFailure = true;
    await openBooking(tester, repo);
    await tester.ensureVisible(find.text('Confirm booking'));
    await tester.tap(find.text('Confirm booking'));
    await tester.pumpAndSettle();
    expect(repo.requests, 1);
    expect(find.text('Booked ride'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'booking retries freeze the note and keep their idempotency key',
    (tester) async {
      final repo = BookingRepo();
      await openBooking(tester, repo);
      await tester.enterText(find.byType(TextField), 'Near the main gate');
      await tester.ensureVisible(find.text('Confirm booking'));
      await tester.tap(find.text('Confirm booking'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Check and retry booking'));
      await tester.tap(find.text('Check and retry booking'));
      await tester.pumpAndSettle();
      expect(repo.requests, 2);
      expect(repo.keys[0], isNotEmpty);
      expect(repo.keys[0], repo.keys[1]);
      expect(repo.notes, ['Near the main gate', 'Near the main gate']);
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'rider search remains pending until the server reports its outcome',
    (tester) async {
      final repo = TripRepo();
      await tester.pumpWidget(
        harness(
          RideDetailPage(
            operationsRepository: repo,
            mapBuilder: (_) => const SizedBox(),
          ),
          ride: 'ride',
        ),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 4));
      expect(find.text('Finding your driver'), findsOneWidget);
      expect(find.text('No driver available'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('failed live refresh retains the last confirmed trip', (
    tester,
  ) async {
    final repo = TripRepo();
    await tester.pumpWidget(
      harness(
        RideDetailPage(
          operationsRepository: repo,
          mapBuilder: (_) => const SizedBox(),
        ),
        ride: 'ride',
      ),
    );
    await tester.pumpAndSettle();
    repo.fail = true;
    await tester.tap(find.byTooltip('Refresh ride'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Connection update failed'), findsOneWidget);
    expect(find.text('Finding your driver'), findsOneWidget);
    expect(find.text('Ride cancelled'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a driver-owned snapshot cannot render as a rider trip', (
    tester,
  ) async {
    final repo = TripRepo()..driver = true;
    await tester.pumpWidget(
      harness(
        RideDetailPage(
          operationsRepository: repo,
          mapBuilder: (_) => const SizedBox(),
        ),
        ride: 'ride',
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.textContaining('not available to your rider account'),
      findsOneWidget,
    );
    expect(find.text('Finding your driver'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'editing a saved address invalidates its old coordinates and waits three seconds',
    (tester) async {
      final repo = PlacesRepo();
      await tester.pumpWidget(
        harness(
          Scaffold(
            body: SavedPlaceEditor(
              repository: repo,
              initial: {
                'label': 'Home',
                'address': 'Old address',
                'latitude': '25.2',
                'longitude': '86.9',
                'place_type': 'HOME',
              },
            ),
          ),
        ),
      );
      await tester.enterText(find.byType(TextFormField).last, 'New station');
      await tester.pump(const Duration(seconds: 2));
      expect(repo.searches, isEmpty);
      await tester.tap(find.text('Save place'));
      await tester.pump();
      expect(find.text('Choose an address from the results'), findsOneWidget);
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(repo.searches, ['New station']);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'history filters request rider-specific sections and restart pagination',
    (tester) async {
      final repo = HistoryRepo();
      await tester.pumpWidget(harness(RidesPage(repository: repo)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Active'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Past'));
      await tester.pumpAndSettle();
      expect(repo.sections, ['all', 'active', 'past']);
      expect(repo.pages, [1, 1, 1]);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
