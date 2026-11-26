import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';

Future<void> showWalletSheet(
  BuildContext context, {
  required String title,
  required Widget content,
  String? value,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  backgroundColor: Colors.transparent,
  builder: (sheetContext) => ClipRRect(
    borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
    child: ColoredBox(
      color: Colors.black,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          RideArrivalStrip(label: title, value: value ?? ''),
          Flexible(
            child: SolidSheet(
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: EdgeInsets.only(
                    bottom: MediaQuery.viewInsetsOf(sheetContext).bottom,
                  ),
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                    child: content,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  ),
);
