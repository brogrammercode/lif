import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/glass_dropdown.dart';
import 'package:user/components/ui/liquid_glass.dart';

final _preview = GlobalKey();
Widget shell(Widget child, {double scale = 1, bool highContrast = false}) =>
    MaterialApp(
      theme: ThemeData(useMaterial3: true, fontFamily: 'Outfit'),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          disableAnimations: true,
          textScaler: TextScaler.linear(scale),
          highContrast: highContrast,
        ),
        child: RepaintBoundary(key: _preview, child: child!),
      ),
      home: LiquidGlassPage(
        title: 'Your details',
        child: SingleChildScrollView(
          child: Padding(padding: const EdgeInsets.only(top: 24), child: child),
        ),
      ),
    );

Future<void> capture(WidgetTester tester, String name) async {
  if (!const bool.fromEnvironment('SETTINGS_PREVIEW')) return;
  await tester.runAsync(() async {
    final boundary =
        _preview.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final dir = Directory('build/ui-review');
    await dir.create(recursive: true);
    await File(
      '${dir.path}/$name.png',
    ).writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

Future<void> open(WidgetTester tester) async {
  await tester.tap(find.byType(LiquidGlassSelectField).first);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
    final font = File('.dart_tool/settings-preview-font.ttf');
    if (font.existsSync()) {
      final face = FontLoader('Outfit')
        ..addFont(Future.value(ByteData.sublistView(font.readAsBytesSync())));
      await face.load();
    }
  });

  testWidgets('selection preserves opaque IDs, validates, saves and resets', (
    tester,
  ) async {
    final form = GlobalKey<FormState>();
    String? changed, saved;
    await tester.pumpWidget(
      shell(
        Form(
          key: form,
          child: LiquidGlassDropdownFormField<String>(
            decoration: const InputDecoration(
              labelText: 'Vehicle category',
              hintText: 'Choose category',
            ),
            items: const [
              DropdownMenuItem(
                value: '9007199254740993',
                child: Text('Comfort'),
              ),
              DropdownMenuItem(
                value: '9007199254740992',
                child: Text('Economy'),
              ),
            ],
            onChanged: (value) => changed = value,
            validator: (value) => value == null ? 'Select a category.' : null,
            onSaved: (value) => saved = value,
          ),
        ),
      ),
    );
    expect(form.currentState!.validate(), isFalse);
    await tester.pumpAndSettle();
    expect(find.text('Select a category.'), findsOneWidget);
    await open(tester);
    expect(find.byTooltip('Close options'), findsOneWidget);
    await tester.tap(find.text('Comfort'));
    await tester.pumpAndSettle();
    expect(changed, '9007199254740993');
    expect(form.currentState!.validate(), isTrue);
    form.currentState!.save();
    expect(saved, '9007199254740993');
    form.currentState!.reset();
    await tester.pumpAndSettle();
    expect(changed, isNull);
    expect(find.text('Choose category'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'false and empty-string options are real selections and dismissal is inert',
    (tester) async {
      bool? chosen = true;
      await tester.pumpWidget(
        shell(
          LiquidGlassDropdownFormField<bool>(
            initialValue: true,
            decoration: const InputDecoration(labelText: 'Vehicle owned?'),
            items: const [
              DropdownMenuItem(value: true, child: Text('Yes')),
              DropdownMenuItem(value: false, child: Text('No')),
            ],
            onChanged: (value) => chosen = value,
          ),
        ),
      );
      await open(tester);
      await tester.tap(find.text('No'));
      await tester.pumpAndSettle();
      expect(chosen, isFalse);
      await open(tester);
      expect(find.byIcon(Icons.check), findsOneWidget);
      await tester.tapAt(const Offset(2, 2));
      await tester.pumpAndSettle();
      expect(chosen, isFalse);
      String? optional;
      await tester.pumpWidget(
        shell(
          LiquidGlassDropdownFormField<String>(
            decoration: const InputDecoration(labelText: 'Optional choice'),
            items: const [
              DropdownMenuItem(value: '', child: Text('Not provided')),
            ],
            onChanged: (value) => optional = value,
          ),
        ),
      );
      await open(tester);
      await tester.tap(find.text('Not provided'));
      await tester.pumpAndSettle();
      expect(optional, '');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'external/dependent option changes clear stale values and ignore an outdated menu result',
    (tester) async {
      late StateSetter refresh;
      var items = const [
        DropdownMenuItem(value: 'old', child: Text('Previous city')),
      ];
      String? current = 'old', selected;
      final field = GlobalKey<FormFieldState<String>>();
      await tester.pumpWidget(
        shell(
          StatefulBuilder(
            builder: (context, update) {
              refresh = update;
              return LiquidGlassDropdownFormField<String>(
                key: field,
                initialValue: current,
                items: items,
                decoration: const InputDecoration(labelText: 'City'),
                onChanged: (value) => selected = value,
              );
            },
          ),
        ),
      );
      await open(tester);
      refresh(() {
        current = null;
        items = const [DropdownMenuItem(value: 'new', child: Text('New city'))];
      });
      await tester.pumpAndSettle();
      await tester.tap(find.text('Previous city'));
      await tester.pumpAndSettle();
      expect(selected, isNull);
      expect(field.currentState!.value, isNull);
      await open(tester);
      expect(find.text('New city'), findsOneWidget);
      await tester.tap(find.text('New city'));
      await tester.pumpAndSettle();
      expect(selected, 'new');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'locked, loading, empty and disabled options cannot change the value',
    (tester) async {
      var calls = 0;
      await tester.pumpWidget(
        shell(
          Column(
            children: [
              LiquidGlassDropdownFormField<String>(
                initialValue: 'locked',
                decoration: const InputDecoration(labelText: 'Approved answer'),
                items: const [
                  DropdownMenuItem(value: 'locked', child: Text('Approved')),
                ],
                onChanged: null,
              ),
              const SizedBox(height: 20),
              LiquidGlassDropdownFormField<String>(
                loading: true,
                items: const [
                  DropdownMenuItem(value: 'busy', child: Text('Busy')),
                ],
                onChanged: (_) => calls++,
              ),
              const SizedBox(height: 20),
              LiquidGlassDropdownFormField<String>(
                items: const [],
                onChanged: (_) => calls++,
              ),
            ],
          ),
        ),
      );
      for (var i = 0; i < 3; i++) {
        await tester.tap(find.byType(LiquidGlassSelectField).at(i));
        await tester.pumpAndSettle();
      }
      expect(find.byType(AppSkeleton), findsOneWidget);
      expect(find.byTooltip('Close options'), findsNothing);
      expect(calls, 0);
      await tester.pumpWidget(
        shell(
          LiquidGlassDropdownFormField<String>(
            items: const [
              DropdownMenuItem(
                value: 'disabled',
                enabled: false,
                child: Text('Unavailable'),
              ),
              DropdownMenuItem(value: 'enabled', child: Text('Available')),
            ],
            onChanged: (_) => calls++,
          ),
        ),
      );
      await open(tester);
      await tester.tap(find.text('Unavailable'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Close options'), findsOneWidget);
      expect(calls, 0);
    },
  );

  testWidgets(
    'long lists search labels case-insensitively and report no matches',
    (tester) async {
      String? selected;
      await tester.pumpWidget(
        shell(
          LiquidGlassDropdownFormField<String>(
            decoration: const InputDecoration(labelText: 'City'),
            items: List.generate(
              30,
              (index) => DropdownMenuItem(
                value: 'id-$index',
                child: Text('City $index'),
              ),
            ),
            onChanged: (value) => selected = value,
          ),
        ),
      );
      await open(tester);
      await tester.enterText(find.byType(TextField), 'nothing here');
      await tester.pumpAndSettle();
      expect(find.text('No matching options'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'cITY 29');
      await tester.pumpAndSettle();
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(selected, 'id-29');
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await tester.pumpAndSettle();
      expect(find.byTooltip('Close options'), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pumpAndSettle();
      expect(find.byTooltip('Close options'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  for (final highContrast in [false, true]) {
    testWidgets(
      'menu fits narrow large-text layout with high contrast $highContrast',
      (tester) async {
        tester.view.physicalSize = const Size(320, 640);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          shell(
            LiquidGlassDropdownFormField<String>(
              initialValue: 'one',
              decoration: const InputDecoration(labelText: 'Ownership type'),
              items: const [
                DropdownMenuItem(
                  value: 'one',
                  child: Text('Individually owned'),
                ),
                DropdownMenuItem(
                  value: 'two',
                  child: Text('Shared with a registered business partner'),
                ),
              ],
              onChanged: (_) {},
            ),
            scale: 2,
            highContrast: highContrast,
          ),
        );
        await open(tester);
        final menu = tester.getRect(find.byType(CustomScrollView));
        expect(menu.left, greaterThanOrEqualTo(0));
        expect(menu.right, lessThanOrEqualTo(320));
        expect(menu.bottom, lessThanOrEqualTo(640));
        if (highContrast) expect(find.byType(BackdropFilter), findsNothing);
        await capture(
          tester,
          highContrast
              ? 'glass-dropdown-high-contrast'
              : 'glass-dropdown-large-text',
        );
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('search remains scrollable in landscape with keyboard insets', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(568, 320);
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 140);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpWidget(
      shell(
        LiquidGlassDropdownFormField<String>(
          decoration: const InputDecoration(labelText: 'Postal district'),
          items: List.generate(
            100,
            (index) => DropdownMenuItem(
              value: '$index',
              child: Text('Postal district $index'),
            ),
          ),
          onChanged: (_) {},
        ),
      ),
    );
    await open(tester);
    await tester.enterText(find.byType(TextField), 'district 99');
    await tester.pumpAndSettle();
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -160));
    await tester.pumpAndSettle();
    expect(find.text('Postal district 99'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
