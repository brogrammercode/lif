import 'package:flutter/material.dart';

final appRouteObserver = RouteObserver<ModalRoute<dynamic>>();

class RideRouteObserverScope extends InheritedWidget {
  final RouteObserver<ModalRoute<dynamic>> observer;
  const RideRouteObserverScope({
    super.key,
    required this.observer,
    required super.child,
  });
  static RouteObserver<ModalRoute<dynamic>> of(BuildContext context) =>
      context
          .getInheritedWidgetOfExactType<RideRouteObserverScope>()
          ?.observer ??
      appRouteObserver;
  @override
  bool updateShouldNotify(RideRouteObserverScope oldWidget) =>
      observer != oldWidget.observer;
}
