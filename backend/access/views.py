

from django.http import HttpResponse
def api_root(request):
    return HttpResponse("<h1>ERP AI Backend Is Running</h1><p>Use <b>/admin</b> for management.</p>")
