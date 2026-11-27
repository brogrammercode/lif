import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/features/settings/controllers/wallet_controller.dart';
import 'package:user/features/settings/controllers/settings_controller.dart';
import 'package:user/features/settings/pages/wallet_add_money_page.dart';
import 'package:user/features/settings/pages/wallet_page.dart';
import 'package:user/features/settings/pages/wallet_transaction_flow.dart';
import 'package:user/features/settings/settings.repo.dart';
import 'package:user/features/settings/widgets/wallet_payment_progress.dart';

class _Wallet extends WalletController {
  _Wallet(this.verifiedStatus)
    : super(
        driver: false,
        client: DioClient.forTesting(
          client: Dio(),
          createRefreshClient: Dio.new,
        ),
      ) {
    topUpsEnabled = true;
  }

  final topUp = WalletTopUp.fromMap({
    'id': '87c3e87b-9400-4032-8a64-344af5746bfc',
    'status': 'PENDING',
    'amount_paise': '1000',
    'created_at': '2026-11-27T00:00:00Z',
    'sdk_checkout': {'key_id': 'rzp_test_fixture', 'order_id': 'order_fixture'},
  });
  final String verifiedStatus;
  final startResponse = Completer<void>();
  final checkResponse = Completer<void>();
  int checks = 0;

  @override
  Future<void> loadTopUps() async {}

  @override
  Future<WalletTopUp?> startTopUp(
    int paise, {
    required bool nativeCheckout,
  }) async {
    expect(nativeCheckout, isTrue);
    expect(paise, 1000);
    await startResponse.future;
    update(() => topUps = [topUp]);
    return topUp;
  }

  @override
  Future<String?> checkoutPhone() async => '+919876543210';

  @override
  Future<WalletTopUp?> checkTopUp(String id, {bool cancelled = false}) async {
    expect(id, topUp.id);
    expect(cancelled, verifiedStatus == 'CANCELLED');
    checks++;
    await checkResponse.future;
    final checked = WalletTopUp.fromMap({
      'id': id,
      'status': verifiedStatus,
      'amount_paise': '1000',
      'created_at': '2026-11-27T00:00:00Z',
      if (verifiedStatus == 'FAILED') 'failure_reason': 'Payment timed out',
    });
    update(() => topUps = [checked]);
    return checked;
  }
}

void main() {
  testWidgets('driver wallet switches ledger and payouts inside its history', (
    tester,
  ) async {
    final dio = Dio(BaseOptions(baseUrl: 'https://wallet.example.test'));
    final payoutMethodsResponse = Completer<void>();
    var destinationSaved = false;
    final cash = {
      'id': 'cash-entry',
      'kind': 'CASH_PAYMENT',
      'available_delta_paise': '0',
      'held_delta_paise': '0',
      'available_after_paise': '12044',
      'external_amount_paise': '5969',
      'created_at': '2026-11-27T00:00:00Z',
    };
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (options.path == '/driver/wallet/payout-methods' &&
              options.method == 'GET') {
            await payoutMethodsResponse.future;
          }
          final data = switch (options.path) {
            '/wallet' => {
              'available_paise': '12044',
              'payout_available_paise': '10044',
              'cash_collected_paise': '5969',
              'held_paise': '0',
              'rows': [cash],
            },
            '/driver/wallet/payout-methods' when options.method == 'POST' => {
              'id': 'bank-1',
              'kind': 'BANK_ACCOUNT',
              'status': 'PENDING',
              'masked_label': 'Bank account •••• 1234',
              'is_default': true,
              'selectable': true,
            },
            '/driver/wallet/payout-methods' => {'rows': <Object>[]},
            '/driver/wallet/payouts' => {
              'next_run_at': '2026-11-30T23:30:00Z',
              'rows': [
                {
                  'id': 'paid-entry',
                  'kind': 'PAYOUT_SETTLED',
                  'payout_id': 'payout-1',
                  'available_delta_paise': '0',
                  'held_delta_paise': '-8000',
                  'available_after_paise': '0',
                  'created_at': '2026-11-22T00:00:00Z',
                },
              ],
            },
            '/driver/wallet/payouts/payout-1' => {
              'amount_paise': '8000',
              'adjustments_paise': '0',
              'status': 'PAID',
              'utr': 'UTR-DEMO',
            },
            _ => throw StateError('Unexpected endpoint ${options.path}'),
          };
          if (options.method == 'POST') {
            expect(options.data, {
              'kind': 'BANK_ACCOUNT',
              'name': 'Fixture Driver',
              'account_number': '123456781234',
              'ifsc': 'HDFC0000053',
            });
            destinationSaved = true;
          }
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {'status': 'success', 'data': data},
            ),
          );
        },
      ),
    );
    final settings = SettingsController(
      SettingsRepository(
        walletClient: DioClient.forTesting(
          client: dio,
          createRefreshClient: Dio.new,
        ),
      ),
    );
    addTearDown(settings.dispose);
    await tester.pumpWidget(
      MaterialApp(home: WalletPage(controller: settings, driver: true)),
    );
    await tester.pumpAndSettle();
    expect(find.text('₹100.44'), findsOneWidget);
    expect(
      find.text('₹59.69 already settled through cash', findRichText: true),
      findsOneWidget,
    );
    expect(find.text('Setup payout'), findsOneWidget);
    final ledger = find.text('Ledger');
    final payoutCycle = find.text('Payout cycle');
    expect(find.byType(ChoiceChip), findsNothing);
    final actionAvatar = tester.widget<CircleAvatar>(
      find.descendant(
        of: find.ancestor(
          of: find.text('Setup payout'),
          matching: find.byType(InkWell),
        ),
        matching: find.byType(CircleAvatar),
      ),
    );
    for (final label in [ledger, payoutCycle]) {
      final avatar = tester.widget<CircleAvatar>(
        find.descendant(
          of: find.ancestor(of: label, matching: find.byType(InkWell)),
          matching: find.byType(CircleAvatar),
        ),
      );
      expect(avatar.radius, actionAvatar.radius);
      expect(avatar.backgroundColor, actionAvatar.backgroundColor);
    }
    await tester.scrollUntilVisible(
      find.text('Cash payment'),
      140,
      scrollable: find.byType(Scrollable),
    );
    await tester.pumpAndSettle();
    expect(find.text('Cash payment'), findsOneWidget);
    await tester.ensureVisible(payoutCycle);
    await tester.tap(payoutCycle);
    await tester.pumpAndSettle();
    final schedule = find.text('Next scheduled payout');
    expect(schedule, findsOneWidget);
    expect(ModalRoute.of(tester.element(schedule))?.isFirst, isTrue);
    expect(find.text('Previous payouts'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Payout paid'),
      140,
      scrollable: find.byType(Scrollable),
    );
    await tester.pumpAndSettle();
    expect(find.text('+₹80.00'), findsOneWidget);
    await tester.tap(find.text('Payout paid'));
    await tester.pumpAndSettle();
    expect(find.text('UTR-DEMO'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await tester.ensureVisible(ledger);
    await tester.tap(ledger);
    await tester.pumpAndSettle();
    expect(find.text('Cash payment'), findsOneWidget);
    await tester.ensureVisible(find.text('Setup payout'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Setup payout'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    final methodLabels = ['Bank account', 'Debit card', 'UPI'];
    final loadingSizes = [
      for (final label in methodLabels)
        tester.getSize(find.widgetWithText(ChoiceChip, label)),
    ];
    final bankChip = find.widgetWithText(ChoiceChip, 'Bank account');
    final loadingChip = tester.widget<ChoiceChip>(bankChip);
    expect(loadingChip.onSelected, isNull);
    expect(
      loadingChip.color!.resolve({WidgetState.disabled, WidgetState.selected}),
      Colors.black,
    );
    expect(loadingChip.labelStyle?.color, Colors.white);
    payoutMethodsResponse.complete();
    await tester.pumpAndSettle();
    expect([
      for (final label in methodLabels)
        tester.getSize(find.widgetWithText(ChoiceChip, label)),
    ], loadingSizes);
    await tester.tap(find.text('UPI'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'UPI'))
          .color!
          .resolve({WidgetState.selected}),
      Colors.black,
    );
    await tester.tap(bankChip);
    await tester.pumpAndSettle();
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Fixture Driver');
    await tester.enterText(fields.at(1), '123456781234');
    await tester.enterText(fields.at(2), 'HDFC0000053');
    final save = find.text('Save payout account');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(destinationSaved, isTrue);
    expect(find.text('Default payout account'), findsOneWidget);
    expect(find.text('123456781234'), findsNothing);
  });

  testWidgets('payment progress sheet follows the verified top-up result', (
    tester,
  ) async {
    const id = 'pending-123';
    final dio = Dio(BaseOptions(baseUrl: 'https://wallet.example.test'));
    final pending = {
      'id': id,
      'status': 'PENDING',
      'amount_paise': '1000',
      'created_at': '2026-11-27T00:00:00Z',
    };
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final data = switch (options.path) {
            '/wallet/topups' => {
              'enabled': true,
              'rows': [pending],
            },
            '/wallet/topups/$id/check' => {...pending, 'status': 'CAPTURED'},
            '/wallet' => {
              'available_paise': '1000',
              'held_paise': '0',
              'has_more': false,
              'rows': <Object>[],
            },
            _ => throw StateError('Unexpected endpoint ${options.path}'),
          };
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {'status': 'success', 'data': data},
            ),
          );
        },
      ),
    );
    final wallet = WalletController(
      driver: false,
      client: DioClient.forTesting(client: dio, createRefreshClient: () => dio),
    );
    addTearDown(wallet.dispose);
    await tester.runAsync(wallet.loadTopUps);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: child!,
        ),
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showWalletPaymentProgress(
                context,
                wallet: wallet,
                item: wallet.history.single,
              ),
              child: const Text('Open payment'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open payment'));
    await tester.pumpAndSettle();
    expect(find.byType(WalletPaymentTimeline), findsOneWidget);
    expect(find.text('Payment timeline'), findsOneWidget);
    expect(find.text('Payment successful'), findsNothing);
    final check = find.text('Check payment status');
    await tester.scrollUntilVisible(
      check,
      140,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(check);
    await tester.pumpAndSettle();
    expect(find.text('Payment successful'), findsOneWidget);
    expect(find.text('Wallet credited'), findsOneWidget);
    expect(check, findsNothing);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
  });

  testWidgets(
    'wallet history scrolls and opens details for each top-up status',
    (tester) async {
      tester.view.physicalSize = const Size(360, 620);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final dio = Dio(BaseOptions(baseUrl: 'https://wallet.example.test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            final data = switch (options.path) {
              '/wallet' => {
                'id': 'wallet-1',
                'available_paise': '10000',
                'held_paise': '0',
                'has_more': false,
                'rows': [
                  {
                    'id': 'ledger-success',
                    'kind': 'TOP_UP',
                    'topup_id': 'success-1',
                    'available_delta_paise': '10000',
                    'held_delta_paise': '0',
                    'available_after_paise': '10000',
                    'created_at': '2026-11-25T00:00:00Z',
                  },
                ],
              },
              '/wallet/topups' => {
                'enabled': true,
                'rows': [
                  {
                    'id': 'failed-1',
                    'status': 'FAILED',
                    'amount_paise': '20000',
                    'failure_reason': 'Payment timed out',
                    'created_at': '2026-11-27T00:00:00Z',
                  },
                  {
                    'id': 'cancelled-1',
                    'status': 'CANCELLED',
                    'amount_paise': '30000',
                    'created_at': '2026-11-26T00:00:00Z',
                  },
                  {
                    'id': 'success-1',
                    'status': 'CAPTURED',
                    'amount_paise': '10000',
                    'created_at': '2026-11-25T00:00:00Z',
                  },
                ],
              },
              _ => throw StateError('Unexpected endpoint ${options.path}'),
            };
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'status': 'success', 'data': data},
              ),
            );
          },
        ),
      );
      final settings = SettingsController(
        SettingsRepository(
          walletClient: DioClient.forTesting(
            client: dio,
            createRefreshClient: () => dio,
          ),
        ),
      );
      addTearDown(settings.dispose);
      await tester.pumpWidget(
        MaterialApp(home: WalletPage(controller: settings, driver: false)),
      );
      await tester.pumpAndSettle();
      final scroll = find.byType(Scrollable).first;
      for (final (key, detail) in [
        ('failed-1', 'Payment timed out'),
        ('cancelled-1', 'cancelled-1'),
        ('ledger-success', 'Wallet balance after'),
      ]) {
        final card = find.byKey(ValueKey(key));
        await tester.scrollUntilVisible(card, 180, scrollable: scroll);
        await tester.ensureVisible(card);
        await tester.pumpAndSettle();
        await tester.tap(card);
        await tester.pumpAndSettle();
        final sheet = find.byType(WalletTransactionDetails);
        expect(sheet, findsOneWidget);
        expect(
          find.descendant(of: sheet, matching: find.text(detail)),
          findsOneWidget,
        );
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
      }
      expect(find.byKey(const ValueKey('success-1')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  test(
    'history reconciles a pending top-up and displays its ledger credit once',
    () async {
      const id = '87c3e87b-9400-4032-8a64-344af5746bfc';
      const date = '2026-11-27T00:00:00Z';
      var checks = 0;
      final dio = Dio(BaseOptions(baseUrl: 'https://wallet.example.test'));
      final topUp = {'id': id, 'amount_paise': '1000', 'created_at': date};
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            final Object data = switch (options.path) {
              '/wallet' => {
                'available_paise': checks == 0 ? '0' : '1000',
                'held_paise': '0',
                'has_more': false,
                'rows': [
                  if (checks > 0)
                    {
                      'id': 'entry',
                      'kind': 'TOP_UP',
                      'topup_id': id,
                      'available_delta_paise': '1000',
                      'held_delta_paise': '0',
                      'available_after_paise': '1000',
                      'created_at': date,
                    },
                ],
              },
              '/wallet/topups' => {
                'enabled': true,
                'rows': [
                  {...topUp, 'status': 'PENDING'},
                ],
              },
              '/wallet/topups/$id/check' => {
                ...topUp,
                'status': ++checks == 1 ? 'CAPTURED' : 'PENDING',
              },
              _ => throw StateError('Unexpected endpoint ${options.path}'),
            };
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {'status': 'success', 'data': data},
              ),
            );
          },
        ),
      );
      final wallet = WalletController(
        driver: false,
        client: DioClient.forTesting(
          client: dio,
          createRefreshClient: () => dio,
        ),
      );
      addTearDown(wallet.dispose);
      await wallet.refreshHistory();
      expect(checks, 1);
      expect(wallet.availablePaise, 1000);
      expect(wallet.transactions.single.topUpId, id);
      expect(wallet.topUpsWithoutLedgerCredit, isEmpty);
    },
  );

  test(
    'reloads wallet top-ups without posting a status check for a malformed ID',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://wallet.example.test'));
      final requests = <String>[];
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            requests.add('${options.method} ${options.path}');
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'status': 'success',
                  'data': {
                    'enabled': true,
                    'rows': [
                      {'id': 'bad reference'},
                      {
                        'id': '87c3e87b-9400-4032-8a64-344af5746bfc',
                        'status': 'PENDING',
                        'amount_paise': '1000',
                        'created_at': '2026-11-27T00:00:00Z',
                      },
                    ],
                  },
                },
              ),
            );
          },
        ),
      );
      final wallet = WalletController(
        driver: false,
        client: DioClient.forTesting(
          client: dio,
          createRefreshClient: () => dio,
        ),
      );
      addTearDown(wallet.dispose);
      expect(await wallet.checkTopUp('bad reference'), isNull);
      expect(requests, ['GET /wallet/topups']);
      expect(wallet.topUps.single.id, '87c3e87b-9400-4032-8a64-344af5746bfc');
    },
  );

  for (final (status, title) in [
    ('CAPTURED', 'Payment successful'),
    ('FAILED', 'Payment failed'),
    ('CANCELLED', 'Payment cancelled'),
  ]) {
    testWidgets('keeps the progress sheet through checkout and $status', (
      tester,
    ) async {
      const channel = MethodChannel('razorpay_flutter');
      final messenger = tester.binding.defaultBinaryMessenger;
      final result = Completer<Map<String, dynamic>>();
      MethodCall? checkout;
      messenger.setMockMethodCallHandler(channel, (call) async {
        if (call.method != 'open') return null;
        checkout = call;
        return result.future;
      });
      addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
      final wallet = _Wallet(status);
      addTearDown(wallet.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showWalletAddMoney(context, wallet: wallet),
                child: const Text('Open wallet amount'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open wallet amount'));
      await tester.pumpAndSettle();
      expect(find.text('Quick amount'), findsOneWidget);
      await tester.tap(find.text('1'));
      await tester.tap(find.text('0'));
      await tester.pumpAndSettle();
      expect(find.text('₹10'), findsOneWidget);
      await tester.tap(find.text('Continue to Razorpay'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.text('Payment progress'), findsOneWidget);
      expect(find.text('Preparing payment'), findsOneWidget);
      expect(checkout, isNull);

      wallet.startResponse.complete();
      await tester.pump();
      await tester.pump();
      expect(checkout?.arguments['order_id'], 'order_fixture');
      expect(checkout?.arguments['prefill'], {'contact': '+919876543210'});
      await tester.binding.handlePopRoute();
      await tester.pump();
      expect(find.text('Payment progress'), findsOneWidget);
      expect(wallet.checks, 0);

      result.complete(
        status == 'CAPTURED'
            ? {
                'type': 0,
                'data': {
                  'order_id': 'order_fixture',
                  'payment_id': 'payment_fixture',
                },
              }
            : {
                'type': 1,
                'data': {'code': status == 'CANCELLED' ? 2 : 0},
              },
      );
      await tester.pump();
      expect(wallet.checks, 1);
      expect(find.text('Payment progress'), findsOneWidget);
      expect(find.text('Add more money'), findsNothing);
      expect(find.text('Back to wallet'), findsNothing);

      wallet.checkResponse.complete();
      await tester.pumpAndSettle();
      expect(wallet.checks, 1);
      expect(find.text('Payment progress'), findsOneWidget);
      expect(find.text(title), findsWidgets);
      if (status == 'FAILED') {
        expect(find.text('Payment timed out'), findsOneWidget);
      }
      final action = find.text(
        status == 'CAPTURED' ? 'Add more money' : 'Back to wallet',
      );
      await tester.ensureVisible(action);
      await tester.tap(action);
      await tester.pumpAndSettle();
      expect(find.text('Payment progress'), findsNothing);
      if (status == 'CAPTURED') {
        expect(find.byType(WalletAddMoneyPage), findsOneWidget);
        expect(find.text('₹0'), findsOneWidget);
      } else {
        expect(find.byType(WalletAddMoneyPage), findsNothing);
        expect(find.text('Open wallet amount'), findsOneWidget);
      }
    }, variant: const TargetPlatformVariant({TargetPlatform.android}));
  }
}
