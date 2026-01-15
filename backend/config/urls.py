from django.contrib import admin
from django.urls import path, include
from access.views import LoginView, LogoutView, UserInfoView, api_root

urlpatterns = [
    path('', api_root),
    path('admin/', admin.site.urls),
    path('api/login/', LoginView.as_view(), name='login'),
    path('api/logout/', LogoutView.as_view(), name='logout'),
    path('api/me/', UserInfoView.as_view(), name='me'),
]
