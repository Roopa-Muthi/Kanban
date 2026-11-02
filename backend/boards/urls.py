from rest_framework.routers import SimpleRouter

from .views import BoardViewSet, CardViewSet, ColumnViewSet

router = SimpleRouter(trailing_slash=False)
router.register("boards", BoardViewSet, basename="board")
router.register("columns", ColumnViewSet, basename="column")
router.register("cards", CardViewSet, basename="card")

urlpatterns = router.urls