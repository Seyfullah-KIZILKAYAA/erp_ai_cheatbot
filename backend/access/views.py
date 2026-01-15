from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import authenticate, login, logout
from rest_framework.permissions import AllowAny, IsAuthenticated
from .models import Role

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        user = authenticate(username=username, password=password)
        if user:
            login(request, user)
            # ManyToMany field üzerinden yetkili tabloları çekiyoruz
            permissions = user.profile.role.allowed_models.values_list('model_name', flat=True) if user.profile.role else []
            return Response({
                'username': user.username,
                'role': user.profile.role.name if user.profile.role else None,
                'permissions': list(permissions)
            })
        return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({'message': 'Logged out'})

class UserInfoView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        permissions = user.profile.role.allowed_models.values_list('model_name', flat=True) if user.profile.role else []
        return Response({
            'username': user.username,
            'role': user.profile.role.name if user.profile.role else None,
            'permissions': list(permissions)
        })

from django.http import HttpResponse
def api_root(request):
    return HttpResponse("<h1>ERP AI Backend Is Running</h1><p>Use <b>/admin</b> for management or <b>/api/login</b> for auth.</p>")
