import 'package:flutter/material.dart';
import 'package:user/core/network/dio_client.dart';

/// The source is inherited above the demo Navigator, including nested routes.
/// A null transport means the normal account-scoped production client.
class DataSourceScope extends InheritedWidget {
  final DioClient? client;
  final Listenable? changes;
  final Map<String, dynamic> Function()? initialEndpoints;
  final String? userId;
  final bool isDemo;
  const DataSourceScope({
    super.key,
    required super.child,
    this.client,
    this.changes,
    this.initialEndpoints,
    this.userId,
    this.isDemo = false,
  });
  static DataSourceScope? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<DataSourceScope>();
  static DataSourceScope? read(BuildContext context) =>
      context.getInheritedWidgetOfExactType<DataSourceScope>();
  @override
  bool updateShouldNotify(DataSourceScope oldWidget) =>
      client != oldWidget.client || isDemo != oldWidget.isDemo;
}
